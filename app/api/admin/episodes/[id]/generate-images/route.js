export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"
import { buildSceneVisualPrompt } from "@/lib/buildSceneVisualPrompt"
import prisma from "@/lib/prisma"
import { loadSeriesRail, railPayload } from "@/lib/series-rail"
import { generateStill } from "@/lib/still-for-rail"
import { uploadBuffer, imagePath, IMAGES_BUCKET } from "@/lib/supabase-storage"
import { selectScenesToGenerate } from "@/lib/storyboard"

async function persistStill(episodeId, sceneIndex, dataUrl, promptText) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "")
  const buffer = Buffer.from(base64, "base64")
  const storagePath = imagePath(episodeId, sceneIndex, Date.now())
  await uploadBuffer(IMAGES_BUCKET, storagePath, buffer, "image/png")
  await prisma.image.upsert({
    where: { episodeId_sceneIndex: { episodeId, sceneIndex } },
    update: { filePath: storagePath, prompt: promptText || null },
    create: { episodeId, sceneIndex, filePath: storagePath, prompt: promptText || null, width: 1080, height: 1920 },
  })
  return storagePath
}

export async function POST(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const onlyMissing = body.onlyMissing !== false
  const sceneIndex = body.sceneIndex
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

  const existingIndexes = new Set((episode.images || []).map((img) => img.sceneIndex))

  let queue
  try {
    queue = selectScenesToGenerate(scenes, existingIndexes, { onlyMissing, sceneIndex, sceneIndexes: body.sceneIndexes })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 })
  }

  if (queue.length === 0) {
    return Response.json({
      message: "All images already exist",
      generated: 0,
      provider,
      usedLeonardo: false,
      contentRail: railPayload(rail, readiness),
    })
  }

  const results = {
    generated: 0,
    failed: 0,
    errors: [],
    provider,
    usedLeonardo: false,
    contentRail: railPayload(rail, readiness),
    indexes: queue.map((item) => item.index),
  }

  async function generateOne({ scene, index }) {
    const planned = buildSceneVisualPrompt({ scene, characters, series, maxLength: 1500 })
    const { dataUrl, provider: used } = await generateStill({
      rail,
      config,
      prompt: planned.prompt,
      referenceImageUrl: planned.referenceImageUrl,
      aspectRatio: "9:16",
      metadata: { episodeId, sceneIndex: index, characterIds: planned.characterIds },
    })
    if (used === "leonardo") results.usedLeonardo = true
    await persistStill(episodeId, index, dataUrl, planned.prompt)
    results.generated++
  }

  for (const item of queue) {
    try {
      await generateOne(item)
    } catch (err) {
      results.failed++
      results.errors.push(`scene ${item.index}: ${err.message}`)
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
      break
    }
  }

  return Response.json({ ...results, episodeId, total: scenes.length })
}
