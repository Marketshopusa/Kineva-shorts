export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { deletePaths, IMAGES_BUCKET } from "@/lib/supabase-storage"

const ALLOWED_EPISODE_FIELDS = [
  "title", "status", "direction", "screenplay", "summary",
  "cliffhanger", "plotThreadsIntroduced", "plotThreadsResolved",
  "musicTrack", "musicVolume", "dubScenes", "defaultDubLang", "published",
]

function pick(obj, keys) {
  const result = {}
  for (const key of keys) {
    if (key in obj) result[key] = obj[key]
  }
  return result
}

export async function GET(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const episode = await prisma.episode.findUnique({
      where: { id: parseInt(id) },
    })

    if (!episode) return Response.json({ error: "Not found" }, { status: 404 })

    return Response.json(episode)
  } catch (error) {
    console.error("Episode GET error:", error)
    return Response.json({ error: "Failed to load episode" }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const data = pick(body, ALLOWED_EPISODE_FIELDS)

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 })
    }

    const episode = await prisma.episode.update({
      where: { id: parseInt(id) },
      data,
    })

    return Response.json(episode)
  } catch (error) {
    console.error("Episode PUT error:", error)
    return Response.json({ error: "Failed to update episode" }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const episodeId = parseInt(id)

    const images = await prisma.image.findMany({ where: { episodeId } })
    const paths = images.map((img) => img.filePath)
    await deletePaths(IMAGES_BUCKET, paths)

    await prisma.episode.delete({
      where: { id: episodeId },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error("Episode DELETE error:", error)
    return Response.json({ error: "Failed to delete episode" }, { status: 500 })
  }
}
