export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { splitIntoChunks } from "@/lib/subtitleUtils"
import { normalizeDubScenes } from "@/lib/dubUtils"
import prisma from "@/lib/prisma"

export async function POST(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 })

  const scenes = episode.screenplay?.scenes || []
  const nested = normalizeDubScenes(episode.dubScenes) || {}
  const langs = Object.keys(nested)

  if (scenes.length === 0 || langs.length === 0) {
    return Response.json({ fixed: 0, message: "No scenes or dubs found" })
  }

  let fixed = 0

  const updatedScenes = scenes.map((scene, i) => {
    const sceneIdx = String(i)
    const subtitles = { ...(scene.subtitles || {}) }
    let changed = false

    for (const lang of langs) {
      const dubInfo = nested[lang]?.[sceneIdx]
      const dubDurationSec = dubInfo?.durationSec
      const text = scene[`text_${lang}`]

      if (!text?.trim() || !dubDurationSec) continue

      // Re-generate chunks calibrated to the actual audio duration
      const chunks = splitIntoChunks(text, dubDurationSec, 30)
      subtitles[lang] = chunks.map(({ text: t, startSec, endSec }) => ({
        text: t,
        startSec: Math.round(startSec * 100) / 100,
        endSec: Math.round(endSec * 100) / 100,
      }))
      fixed++
      changed = true
    }

    return changed ? { ...scene, subtitles } : scene
  })

  await prisma.episode.update({
    where: { id: episodeId },
    data: { screenplay: { ...episode.screenplay, scenes: updatedScenes } },
  })

  return Response.json({ fixed, langs, sceneCount: scenes.length })
}
