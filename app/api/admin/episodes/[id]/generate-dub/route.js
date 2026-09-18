export const dynamic = "force-dynamic"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { synthesizeEdge } from "@/lib/providers/tts/edge.js"
import { putDub, getDubStorageMode } from "@/lib/dub-storage"
import { normalizeDubScenes } from "@/lib/dubUtils"
import { loadSeriesRail } from "@/lib/series-rail"
import { jsonRailError } from "@/lib/http-rail-error"

export async function POST(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const episodeId = parseInt(id, 10)
    if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const lang = body.lang || "en"

    const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
    if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 })

    const { rail } = await loadSeriesRail(episode.seriesId)
    if (rail.voiceProvider !== "edge") {
      return Response.json({ error: `RAIL_MISMATCH: voice must be edge, got ${rail.voiceProvider}` }, { status: 400 })
    }
    if (rail.videoProvider !== "remotion") {
      return Response.json({ error: `RAIL_MISMATCH: video must be remotion` }, { status: 400 })
    }

    const scenes = episode.screenplay?.scenes || []
    if (scenes.length === 0) return Response.json({ error: "Episode has no scenes" }, { status: 400 })

    const missing = []
    for (let i = 0; i < scenes.length; i++) {
      if (!scenes[i][`text_${lang}`]?.trim()) missing.push(i)
    }
    if (missing.length) {
      return Response.json(
        { error: `Missing text_${lang} on scenes: ${missing.join(", ")}` },
        { status: 400 },
      )
    }

    const langScenes = {}
    const storage = getDubStorageMode()

    for (let i = 0; i < scenes.length; i++) {
      const result = await synthesizeEdge({ text: scenes[i][`text_${lang}`].trim(), lang })
      const stored = await putDub({
        seriesId: episode.seriesId,
        episodeId,
        lang,
        sceneIndex: i,
        buffer: result.buffer,
        contentType: result.mimeType || "audio/mpeg",
      })
      langScenes[String(i)] = {
        url: stored.url,
        path: stored.path,
        durationSec: result.durationSec,
        engine: result.engine,
        voice: result.voice,
        storage,
      }
    }

    if (Object.keys(langScenes).length !== scenes.length) {
      return Response.json(
        { error: `Expected ${scenes.length} dubs, got ${Object.keys(langScenes).length}` },
        { status: 500 },
      )
    }

    const existing = normalizeDubScenes(episode.dubScenes) || {}
    const newDubScenes = { ...existing, [lang]: langScenes }
    const newDefault = episode.defaultDubLang || lang

    const updated = await prisma.episode.update({
      where: { id: episodeId },
      data: { dubScenes: newDubScenes, defaultDubLang: newDefault },
    })

    return Response.json({
      dubScenes: updated.dubScenes,
      defaultDubLang: updated.defaultDubLang,
      ttsEngine: "edge",
      storage,
      sceneCount: Object.keys(langScenes).length,
    })
  } catch (err) {
    console.error("generate-dub error:", err)
    return jsonRailError(err) || Response.json({ error: err.message || "Failed to generate dub" }, { status: 500 })
  }
}
