export const dynamic = "force-dynamic"
export const maxDuration = 60
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { loadSeriesRail, railPayload } from "@/lib/series-rail"
import { jsonRailError } from "@/lib/http-rail-error"
import { resolveStoragePathForProvider } from "@/lib/character-reference-provider.js"
import { resolveVideoElementsForProvider, publicVideoElements, falElementsFromResolved } from "@/lib/video-elements.js"
import { planEpisodeMotionShots, shotAllowsStartFrame, assertNoSplitScreenPrompt } from "@/lib/video-shot-plan.js"
import {
  KLING_O1_MODEL,
  buildKlingO1Body,
  submitKlingO1Job,
  getKlingO1Status,
  getKlingO1Result,
} from "@/lib/providers/video/kling.js"
import { clipPath } from "@/lib/video-clip-storage.js"

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

  const url = new URL(request.url)
  const requestId = url.searchParams.get("requestId")
  if (requestId) {
    try {
      const status = await getKlingO1Status(requestId)
      let result = null
      if (status.status === "COMPLETED") {
        result = await getKlingO1Result(requestId)
      }
      return Response.json({
        requestId,
        status: status.status,
        videoUrl: result?.videoUrl || null,
        model: KLING_O1_MODEL,
      })
    } catch (err) {
      return jsonRailError(err) || Response.json({ error: err.message }, { status: 502 })
    }
  }

  try {
    const ctx = await loadMotionContext(episodeId)
    if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status })
    return Response.json({
      dryRun: true,
      episodeId,
      seriesId: ctx.episode.seriesId,
      episodeNumber: ctx.episode.episodeNumber,
      model: KLING_O1_MODEL,
      projectedUsd: ctx.plan.projectedUsd,
      totalDurationSec: ctx.plan.totalDurationSec,
      shotCount: ctx.plan.shotCount,
      capUsd: ctx.plan.capUsd,
      withinCap: ctx.plan.withinCap,
      shots: publicShots({ ...ctx.plan, seriesId: ctx.episode.seriesId, episodeId }),
      contentRail: railPayload(ctx.rail, ctx.readiness),
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
    const ctx = await loadMotionContext(episodeId)
    if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status })
    const { episode, characters, rail, readiness, plan } = ctx

    if (action === "status" && body.requestId) {
      const status = await getKlingO1Status(body.requestId)
      let result = null
      if (status.status === "COMPLETED") {
        result = await getKlingO1Result(body.requestId)
      }
      return Response.json({
        requestId: body.requestId,
        status: status.status,
        videoUrl: result?.videoUrl || null,
        model: KLING_O1_MODEL,
      })
    }

    const publicPlan = {
      dryRun: action !== "submit",
      generated: 0,
      falCalls: 0,
      episodeId,
      seriesId: episode.seriesId,
      episodeNumber: episode.episodeNumber,
      model: KLING_O1_MODEL,
      projectedUsd: plan.projectedUsd,
      totalDurationSec: plan.totalDurationSec,
      shotCount: plan.shotCount,
      capUsd: plan.capUsd,
      withinCap: plan.withinCap,
      usdPerSecond: plan.usdPerSecond,
      shots: publicShots({ ...plan, seriesId: episode.seriesId, episodeId }),
      contentRail: railPayload(rail, readiness),
      signedUrlPersisted: false,
      lipsyncClips: 0,
      elenaCanonical: "characters/2/2/canonical.png",
      ivanCanonical: "characters/2/4/canonical.jpg",
      mateo: "VOICE_ONLY",
    }

    if (action !== "submit") {
      return Response.json(publicPlan)
    }

    const shot = plan.shots.find((item) => item.shotId === body.shotId)
      || plan.shots[Number(body.shotIndex)]
    if (!shot) {
      return Response.json({ error: "Unknown shotId", ...publicPlan }, { status: 400 })
    }
    assertNoSplitScreenPrompt(shot.videoPrompt)

    const onScreen = characters.filter((c) => shot.onScreenCharacterIds.includes(Number(c.id)))
    const resolved = await resolveVideoElementsForProvider(onScreen)
    const falElements = falElementsFromResolved(resolved)

    let imageUrls = []
    if (shot.allowStartFrame && shotAllowsStartFrame(shot.sceneIndex)) {
      const stillPath = stillPathForScene(episode.images, shot.sceneIndex)
      if (stillPath && !/split/i.test(stillPath)) {
        const signedStill = await resolveStoragePathForProvider(stillPath)
        if (signedStill?.providerUrl) imageUrls = [signedStill.providerUrl]
      }
    }

    const prompt = imageUrls.length
      ? `Take @Image1 as composition, wardrobe, and lighting reference for the opening instant, then immediately animate living performance. Do not hold a still photograph. ${shot.videoPrompt}`
      : shot.videoPrompt
    assertNoSplitScreenPrompt(prompt)

    const falBody = buildKlingO1Body({
      prompt,
      elements: falElements,
      imageUrls,
      duration: shot.duration,
      aspectRatio: "9:16",
    })
    const submitted = await submitKlingO1Job(falBody)

    return Response.json({
      ...publicPlan,
      dryRun: false,
      falCalls: 1,
      shotId: shot.shotId,
      sceneIndex: shot.sceneIndex,
      requestId: submitted.requestId,
      status: submitted.status,
      clipPath: clipPath(episode.seriesId, episode.id, shot.shotId),
      characterElements: publicVideoElements(resolved),
      usedStartFrame: imageUrls.length > 0,
      signedUrlPersisted: false,
    })
  } catch (err) {
    return jsonRailError(err) || Response.json({ error: err.message, code: err.code || "VIDEO_GENERATE_FAILED" }, { status: 500 })
  }
}
