export const dynamic = "force-dynamic"
export const maxDuration = 60
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"
import { buildSceneVisualPrompt } from "@/lib/buildSceneVisualPrompt"
import prisma from "@/lib/prisma"
import { loadSeriesRail, railPayload } from "@/lib/series-rail"
import { generateStill } from "@/lib/still-for-rail"
import { uploadBuffer, IMAGES_BUCKET } from "@/lib/supabase-storage"
import { selectScenesToGenerate } from "@/lib/storyboard"
import {
  REQUIRED_VISUAL_CHARACTER_NOT_LOCKED,
  planEpisodeStills,
  planSceneStill,
} from "@/lib/still-plan"
import {
  assertIdentityStillSpendGate,
  preflightSceneStillGeneration,
} from "@/lib/still-preflight"
import { stillPersistTargetFromDataUrl } from "@/lib/still-persist"
import { jsonRailError } from "@/lib/http-rail-error"

async function persistStill(episodeId, sceneIndex, dataUrl, promptText) {
  const target = stillPersistTargetFromDataUrl(episodeId, sceneIndex, dataUrl)
  await uploadBuffer(IMAGES_BUCKET, target.storagePath, target.buffer, target.contentType)
  await prisma.image.upsert({
    where: { episodeId_sceneIndex: { episodeId, sceneIndex } },
    update: { filePath: target.storagePath, prompt: promptText || null },
    create: {
      episodeId,
      sceneIndex,
      filePath: target.storagePath,
      prompt: promptText || null,
      width: target.width,
      height: target.height,
    },
  })
  return target
}

function publicPreflightReport({ plan, planned, preflight, gate, episodeId, sceneIndex }) {
  return {
    ok: true,
    sceneIndex,
    destinationBucket: IMAGES_BUCKET,
    destinationPrefix: `episodes/${episodeId}/${sceneIndex}`,
    providerRoute: plan.providerRoute,
    model: gate.model,
    imagesBucketReady: true,
    onScreenCharacterIds: plan.onScreen.map((c) => c.id),
    voiceOnlyCharacterIds: plan.voiceOnly.map((c) => c.id),
    references: (plan.references || []).map((item) => ({
      characterId: item.characterId,
      name: item.name,
      storagePath: item.storagePath,
    })),
    privateReferenceResolved: (preflight.referenceImageUrls || []).every((url) => /^https:\/\//i.test(url)),
    providerUrlHttps: (preflight.referenceImageUrls || []).every((url) => /^https:\/\//i.test(url)),
    signedUrlPersisted: false,
    storyboardValid: !!planned?.prompt,
    aspectRatio: gate.aspectRatio || "9:16",
  }
}

async function preflightQueuedScene({ scene, index, characters, series, rail, episodeId }) {
  const plan = planSceneStill(scene, characters)
  if (!plan.ready) {
    const err = new Error(plan.blockReason || "still not ready")
    err.code = plan.blockReason?.startsWith(REQUIRED_VISUAL_CHARACTER_NOT_LOCKED)
      ? REQUIRED_VISUAL_CHARACTER_NOT_LOCKED
      : plan.blockReason
    throw err
  }
  const preflight = await preflightSceneStillGeneration({ scene, characters })
  const planned = buildSceneVisualPrompt({ scene, characters, series, maxLength: 1500 })
  const resolvedInput = {
    prompt: planned.prompt,
    referenceImageUrls: preflight.referenceImageUrls,
    references: preflight.references,
    aspectRatio: "9:16",
    metadata: {
      episodeId,
      sceneIndex: index,
      characterIds: planned.onScreenCharacterIds,
      onScreenCharacterIds: planned.onScreenCharacterIds,
      providerRoute: planned.providerRoute,
    },
  }
  const gate = assertIdentityStillSpendGate({ rail, plan, resolvedInput })
  return { plan, planned, preflight, gate, resolvedInput }
}

export async function POST(request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const onlyMissing = body.onlyMissing !== false
  const sceneIndex = body.sceneIndex
  const dryRun = body.dryRun === true
  const config = await getAIConfig()

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { images: true },
  })
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 })

  const { rail, readiness } = await loadSeriesRail(episode.seriesId)
  const provider = rail.imageProvider
  const series = await prisma.series.findUnique({ where: { id: episode.seriesId } })
  const characters = await prisma.character.findMany({ where: { seriesId: episode.seriesId } })

  const scenes = episode.screenplay?.scenes || []
  if (scenes.length === 0) return Response.json({ error: "No scenes found" }, { status: 400 })

  if (dryRun && (sceneIndex == null || sceneIndex === "")) {
    return Response.json({
      dryRun: true,
      generated: 0,
      falCalls: 0,
      provider,
      usedLeonardo: false,
      contentRail: railPayload(rail, readiness),
      plans: planEpisodeStills(episode.screenplay, characters),
      episodeId,
      total: scenes.length,
    })
  }

  const existingIndexes = new Set((episode.images || []).map((img) => img.sceneIndex))

  let queue
  try {
    queue = selectScenesToGenerate(scenes, existingIndexes, { onlyMissing, sceneIndex, sceneIndexes: body.sceneIndexes })
  } catch (err) {
    return Response.json({ error: err.message, falCalls: 0 }, { status: 400 })
  }

  const maxGenerate = Number(body.maxGenerate)
  if (Number.isInteger(maxGenerate) && maxGenerate > 0) {
    queue = queue.slice(0, maxGenerate)
  }

  if (queue.length === 0) {
    return Response.json({
      message: "All images already exist",
      generated: 0,
      falCalls: 0,
      provider,
      usedLeonardo: false,
      contentRail: railPayload(rail, readiness),
    })
  }

  if (dryRun) {
    try {
      const item = queue[0]
      const prepared = await preflightQueuedScene({
        scene: item.scene,
        index: item.index,
        characters,
        series,
        rail,
        episodeId,
      })
      return Response.json({
        dryRun: true,
        generated: 0,
        falCalls: 0,
        provider,
        usedLeonardo: false,
        contentRail: railPayload(rail, readiness),
        episodeId,
        total: scenes.length,
        indexes: queue.map((entry) => entry.index),
        model: prepared.gate.model,
        providerRoute: prepared.plan.providerRoute,
        preflight: publicPreflightReport({
          ...prepared,
          episodeId,
          sceneIndex: item.index,
        }),
      })
    } catch (err) {
      const mapped = jsonRailError(err)
      if (mapped) return mapped
      return Response.json({
        dryRun: true,
        generated: 0,
        falCalls: 0,
        error: err.message,
        code: err.code || "PREFLIGHT_FAILED",
        episodeId,
      }, { status: 409 })
    }
  }

  const results = {
    generated: 0,
    failed: 0,
    errors: [],
    blocked: [],
    provider,
    usedLeonardo: false,
    contentRail: railPayload(rail, readiness),
    indexes: queue.map((item) => item.index),
    falCalls: 0,
    stills: [],
    model: null,
    providerRoute: null,
  }

  async function generateOne({ scene, index }) {
    const prepared = await preflightQueuedScene({
      scene,
      index,
      characters,
      series,
      rail,
      episodeId,
    })
    results.model = prepared.gate.model
    results.providerRoute = prepared.plan.providerRoute
    const { dataUrl, provider: used } = await generateStill({
      rail,
      config,
      prompt: prepared.planned.prompt,
      referenceImageUrls: prepared.preflight.referenceImageUrls,
      references: prepared.preflight.references,
      aspectRatio: "9:16",
      metadata: prepared.resolvedInput.metadata,
    })
    results.falCalls += used === "fal" ? 1 : 0
    if (used === "leonardo") results.usedLeonardo = true
    const persisted = await persistStill(episodeId, index, dataUrl, prepared.planned.prompt)
    results.stills.push({
      sceneIndex: index,
      storagePath: persisted.storagePath,
      contentType: persisted.contentType,
      width: persisted.width,
      height: persisted.height,
      aspectRatio: persisted.aspectRatio,
    })
    results.generated++
  }

  for (const item of queue) {
    try {
      await generateOne(item)
    } catch (err) {
      results.failed++
      results.errors.push(`scene ${item.index}: ${err.message}`)
      results.blocked.push({
        sceneIndex: item.index,
        reason: err.code || err.message,
      })
      const quota = err?.status === 429 || /BLOQUEADO POR CUOTA|429/i.test(String(err?.message || ""))
      if (quota) {
        return Response.json({ ...results, episodeId, total: scenes.length, code: "GEMINI_IMAGE_BLOCKED_QUOTA" }, { status: 429 })
      }
      const topUp = /FAL_TOP_UP_REQUIRED|BLOCKED_BALANCE/i.test(String(err?.message || ""))
      if (topUp) {
        return Response.json({ ...results, episodeId, total: scenes.length, code: "FAL_TOP_UP_REQUIRED" }, { status: 402 })
      }
      if (err?.code === "REFERENCE_AWARE_FAILED" || /REFERENCE_AWARE_FAILED/.test(String(err?.message || ""))) {
        return Response.json({ ...results, episodeId, total: scenes.length, code: "REFERENCE_AWARE_FAILED" }, { status: 502 })
      }
      if (err?.code === REQUIRED_VISUAL_CHARACTER_NOT_LOCKED || String(err?.message || "").includes(REQUIRED_VISUAL_CHARACTER_NOT_LOCKED)) {
        continue
      }
      const mapped = jsonRailError(err)
      if (mapped) return mapped
      break
    }
  }

  return Response.json({ ...results, episodeId, total: scenes.length })
}
