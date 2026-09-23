export const dynamic = "force-dynamic"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { persistStoryboardV1OnScreenplay } from "@/lib/derive-storyboard"
import { planEpisodeStills } from "@/lib/still-plan"
import { STORYBOARD_V1_FIELDS } from "@/lib/storyboard"

export async function GET(request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 })

  const series = await prisma.series.findUnique({ where: { id: episode.seriesId } })
  const characters = await prisma.character.findMany({ where: { seriesId: episode.seriesId } })
  const plans = planEpisodeStills(episode.screenplay, characters)

  return Response.json({
    episodeId: episode.id,
    seriesId: episode.seriesId,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    fields: STORYBOARD_V1_FIELDS,
    plans,
    scenes: (episode.screenplay?.scenes || []).map((scene, index) => ({
      sceneIndex: index,
      scene: scene.scene ?? index + 1,
      characters: scene.characters || [],
      visual_description: scene.visual_description || null,
      zoom_direction: scene.zoom_direction || null,
      tempo: scene.tempo || null,
      duration_sec: scene.duration_sec || null,
      transition: scene.transition || null,
      storyboard: scene.storyboard || null,
    })),
    seriesTitle: series?.title || null,
  })
}

export async function POST(request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const dryRun = body.dryRun === true || body.persist === false

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 })

  const series = await prisma.series.findUnique({ where: { id: episode.seriesId } })
  const characters = await prisma.character.findMany({ where: { seriesId: episode.seriesId } })
  const nextScreenplay = persistStoryboardV1OnScreenplay(episode.screenplay, characters, {
    seriesId: episode.seriesId,
    episodeNumber: episode.episodeNumber,
    series,
  })

  if (dryRun) {
    return Response.json({
      dryRun: true,
      persisted: false,
      falCalls: 0,
      episodeId,
      plans: planEpisodeStills(nextScreenplay, characters),
      screenplay: nextScreenplay,
    })
  }

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: { screenplay: nextScreenplay },
  })

  return Response.json({
    dryRun: false,
    persisted: true,
    falCalls: 0,
    episodeId: updated.id,
    plans: planEpisodeStills(updated.screenplay, characters),
  })
}
