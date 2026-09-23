export const dynamic = "force-dynamic"
export const maxDuration = 60
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { loadSeriesRail, railPayload } from "@/lib/series-rail"
import { jsonRailError } from "@/lib/http-rail-error"
import { resolveStoragePathForProvider } from "@/lib/character-reference-provider.js"
import { publicVideoElements } from "@/lib/video-elements.js"
import { planEpisodeMotionShots, assertNoSplitScreenPrompt, shotAllowsStartFrame } from "@/lib/video-shot-plan.js"
import { clipPath } from "@/lib/video-clip-storage.js"
import {
  inspectClipEngineReadiness,
  resolveClipEngine,
  assertPremiumVideoNotUsed,
} from "@/lib/video-engine.js"
import { auditMinimaxH3 } from "@/lib/providers/video/minimax-h3.js"
import {
  createVideoJob,
  submitJobToWorker,
  pollWorkerJob,
  queueEpisodeShots,
} from "@/lib/providers/video/kineva-engine.js"

function publicShots(plan) {
  return (plan.shots || []).map((shot) => ({
    shotId: shot.shotId,
    sceneIndex: shot.sceneIndex,
    duration: shot.duration,
    onScreenCharacterIds: shot.onScreenCharacterIds,
    voiceOnlyCharacterIds: shot.voiceOnlyCharacterIds,
    characterElements: publicVideoElements(shot.characterElements),
    action: shot.action,
    facialPerformance: shot.facialPerformance,
    bodyPerformance: shot.bodyPerformance,
    cameraAction: shot.cameraAction,
    environmentMotion: shot.environmentMotion,
    dialogue: shot.dialogue,
    narration: shot.narration,
    imagePrompt: shot.imagePrompt,
    motionPrompt: shot.motionPrompt,
    videoPrompt: shot.videoPrompt,
    model: shot.model,
    allowStartFrame: shot.allowStartFrame,
    sharedSpace: shot.sharedSpace,
    lipsync: shot.lipsync,
    outputPath: clipPath(plan.seriesId, plan.episodeId, shot.shotId),
  }))
}

function stillPathForScene(images, sceneIndex) {
  const row = (images || []).find((img) => Number(img.sceneIndex) === Number(sceneIndex))
  return row?.filePath || null
}

async function firstFrameForShot(episode, shot) {
  if (!shotAllowsStartFrame(shot.sceneIndex)) return null
  const stillPath = stillPathForScene(episode.images, shot.sceneIndex)
  if (!stillPath || /split/i.test(stillPath)) return { storagePath: null, providerUrl: null, skipped: "split-screen still refused" }
  const signed = await resolveStoragePathForProvider(stillPath)
  return { storagePath: stillPath, providerUrl: signed.providerUrl }
}

async function loadMotionContext(episodeId) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { images: true },
  })
  if (!episode) return { error: "Episode not found", status: 404 }
  const series = await prisma.series.findUnique({ where: { id: episode.seriesId } })
  const characters = await prisma.character.findMany({ where: { seriesId: episode.seriesId } })
  const { rail, readiness } = await loadSeriesRail(episode.seriesId)
  const plan = planEpisodeMotionShots(episode.screenplay, characters, {
    seriesId: episode.seriesId,
    episodeNumber: episode.episodeNumber,
  })
  return { episode, series, characters, rail, readiness, plan }
}

export async function GET(request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (Number.isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  try {
    const ctx = await loadMotionContext(episodeId)
    if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status })
    const engine = resolveClipEngine()
    const clipReady = inspectClipEngineReadiness()
    return Response.json({
      dryRun: true,
      falCalls: 0,
      falVideoCalls: 0,
      episodeId,
      seriesId: ctx.episode.seriesId,
      episodeNumber: ctx.episode.episodeNumber,
      engine: engine.id,
      mode: engine.mode,
      model: engine.model,
      projectedUsd: 0,
      totalDurationSec: ctx.plan.totalDurationSec,
      shotCount: ctx.plan.shotCount,
      shots: publicShots({ ...ctx.plan, seriesId: ctx.episode.seriesId, episodeId }),
      contentRail: railPayload(ctx.rail, ctx.readiness),
      clipEngine: clipReady,
      minimaxAudit: auditMinimaxH3(),
      signedUrlPersisted: false,
      lipsyncClips: 0,
    })
  } catch (err) {
    return jsonRailError(err) || Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (Number.isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const action = body.action || (body.dryRun === false ? "submit" : "plan")

  try {
    assertPremiumVideoNotUsed(process.env, body.provider || body.model)
    const ctx = await loadMotionContext(episodeId)
    if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status })
    const { episode, rail, readiness, plan } = ctx
    const engine = resolveClipEngine()
    const clipReady = inspectClipEngineReadiness()
    const audit = auditMinimaxH3()

    if (action === "status") {
      const ids = body.jobs || (body.jobId || body.workerJobId
        ? [{ jobId: body.jobId, workerJobId: body.workerJobId || body.jobId }]
        : [])
      if (!ids.length) {
        return Response.json({ error: "jobId required", falVideoCalls: 0 }, { status: 400 })
      }
      const jobs = []
      for (const item of ids) {
        jobs.push(await pollWorkerJob({
          jobId: item.jobId,
          workerJobId: item.workerJobId || item.jobId,
        }))
      }
      return Response.json({
        jobs: jobs.length === 1 ? undefined : jobs,
        ...(jobs.length === 1 ? jobs[0] : {}),
        falCalls: 0,
        falVideoCalls: 0,
        model: engine.model,
      })
    }

    const publicPlan = {
      dryRun: action !== "submit" && action !== "generate-episode",
      generated: 0,
      falCalls: 0,
      falVideoCalls: 0,
      episodeId,
      seriesId: episode.seriesId,
      episodeNumber: episode.episodeNumber,
      engine: engine.id,
      mode: engine.mode,
      model: engine.model,
      projectedUsd: 0,
      totalDurationSec: plan.totalDurationSec,
      shotCount: plan.shotCount,
      shots: publicShots({ ...plan, seriesId: episode.seriesId, episodeId }),
      contentRail: railPayload(rail, readiness),
      clipEngine: clipReady,
      minimaxAudit: audit,
      signedUrlPersisted: false,
      lipsyncClips: 0,
      elenaCanonical: "characters/2/2/canonical.png",
      ivanCanonical: "characters/2/4/canonical.jpg",
      mateo: "VOICE_ONLY",
    }

    if (action !== "submit" && action !== "generate-episode") {
      return Response.json(publicPlan)
    }

    if (!clipReady.ready) {
      const block = clipReady.blocks[0]
      const err = new Error(block?.detail || "VIDEO_WORKER_MISSING")
      err.code = block?.code || "VIDEO_WORKER_MISSING"
      throw err
    }

    if (action === "generate-episode") {
      const firstFramesByShot = {}
      for (const shot of plan.shots) {
        firstFramesByShot[shot.shotId] = await firstFrameForShot(episode, shot)
        assertNoSplitScreenPrompt(shot.videoPrompt)
      }
      const jobs = await queueEpisodeShots({
        ...plan,
        episodeId,
        seriesId: episode.seriesId,
      }, {
        firstFramesByShot,
        chainLastFrame: body.chainLastFrame === true,
      })
      return Response.json({
        ...publicPlan,
        dryRun: false,
        generated: 0,
        queued: jobs.length,
        jobs,
        status: "QUEUED",
        note: "GPU generation is async. Poll action=status. Vercel does not wait on MiniMax.",
      })
    }

    const shot = plan.shots.find((item) => item.shotId === body.shotId)
      || plan.shots[Number(body.shotIndex)]
    if (!shot) {
      return Response.json({ error: "Unknown shotId", ...publicPlan }, { status: 400 })
    }
    assertNoSplitScreenPrompt(shot.videoPrompt)

    const firstFrame = await firstFrameForShot(episode, shot)
    const job = createVideoJob({
      episodeId,
      seriesId: episode.seriesId,
      shotId: shot.shotId,
      prompt: shot.videoPrompt,
      firstFrame,
      duration: shot.duration,
      characterIds: shot.onScreenCharacterIds,
      continuity: { sceneIndex: shot.sceneIndex, sharedSpace: shot.sharedSpace },
      chainLastFrame: body.chainLastFrame === true,
    })
    const queued = await submitJobToWorker(job)
    return Response.json({
      ...publicPlan,
      dryRun: false,
      job: queued,
      shotId: shot.shotId,
      status: queued.status,
      clipPath: clipPath(episode.seriesId, episode.id, shot.shotId),
    })
  } catch (err) {
    return jsonRailError(err) || Response.json({ error: err.message, code: err.code || "VIDEO_GENERATE_FAILED" }, { status: 500 })
  }
}
