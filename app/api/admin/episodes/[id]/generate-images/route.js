export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"
import { buildImagePrompt } from "@/lib/buildImagePrompt"
import prisma from "@/lib/prisma"
import fs from "fs/promises"
import path from "path"
import { loadSeriesRail, railPayload } from "@/lib/series-rail"
import { generateStillForRail } from "@/lib/still-for-rail"

const CONCURRENCY = 3
const IMAGE_SAVE_DIR = (epId) => path.join(process.cwd(), "uploads", "images", String(epId))

async function saveImageToDisk(episodeId, sceneIndex, dataUrl, promptText) {
  const dir = IMAGE_SAVE_DIR(episodeId)
  await fs.mkdir(dir, { recursive: true })
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "")
  await fs.writeFile(path.join(dir, `${sceneIndex}.png`), Buffer.from(base64, "base64"))
  const filePath = path.join("uploads", "images", String(episodeId), `${sceneIndex}.png`)
  await prisma.image.upsert({
    where: { episodeId_sceneIndex: { episodeId, sceneIndex } },
    update: { filePath, prompt: promptText || null },
    create: { episodeId, sceneIndex, filePath, prompt: promptText || null, width: 1080, height: 1920 },
  })
}

export async function POST(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const onlyMissing = body.onlyMissing !== false
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

  const existingFiles = new Set()
  for (let i = 0; i < scenes.length; i++) {
    try {
      await fs.access(path.join(IMAGE_SAVE_DIR(episodeId), `${i}.png`))
      existingFiles.add(i)
    } catch { /* file missing */ }
  }

  const queue = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ index }) => !onlyMissing || !existingFiles.has(index))

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
  }

  async function generateOne({ scene, index }) {
    const fullPrompt = buildImagePrompt({ scene, characters, series, maxLength: 1500 })
    const { dataUrl, provider: used } = await generateStillForRail(rail, fullPrompt, config)
    if (used === "leonardo") results.usedLeonardo = true
    await saveImageToDisk(episodeId, index, dataUrl, fullPrompt)
    results.generated++
  }

  const active = new Map()
  let nextId = 0
  const remaining = [...queue]

  while (remaining.length > 0 || active.size > 0) {
    while (active.size < CONCURRENCY && remaining.length > 0) {
      const item = remaining.shift()
      const id = nextId++
      const p = generateOne(item)
        .then(() => id)
        .catch((err) => {
          results.failed++
          results.errors.push(`scene ${item.index}: ${err.message}`)
          return id
        })
      active.set(id, p)
    }
    if (active.size > 0) {
      const doneId = await Promise.race(active.values())
      active.delete(doneId)
    }
  }

  return Response.json({ ...results, episodeId, total: scenes.length })
}
