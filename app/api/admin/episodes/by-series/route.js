export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function GET(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const seriesId = searchParams.get("seriesId")

    if (!seriesId) return Response.json({ error: "seriesId is required" }, { status: 400 })

    const episodes = await prisma.episode.findMany({
      where: { seriesId: parseInt(seriesId) },
      orderBy: { episodeNumber: "asc" },
    })

    return Response.json(episodes)
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
