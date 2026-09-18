export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { getSignedUrl, RENDERS_BUCKET, renderPath } from "@/lib/supabase-storage"

export async function GET(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  try {
    const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
    if (!episode) return Response.json({ error: "Not found" }, { status: 404 })

    const storagePath = renderPath(episode.seriesId, episode.id)
    const url = await getSignedUrl(RENDERS_BUCKET, storagePath, 60 * 60 * 24)
    return Response.json({
      bucket: RENDERS_BUCKET,
      path: storagePath,
      url,
    })
  } catch (err) {
    const msg = String(err?.message || err)
    if (/not found|Object not found/i.test(msg)) {
      return Response.json({ error: "No remote MP4 yet" }, { status: 404 })
    }
    return Response.json({ error: "Failed to sign render" }, { status: 500 })
  }
}
