export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"

export async function GET(request) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const seriesId = searchParams.get("seriesId")
    const episodeNumber = searchParams.get("episodeNumber")

    if (!seriesId || !episodeNumber) {
      return Response.json({ error: "seriesId and episodeNumber are required" }, { status: 400 })
    }

    const episode = await prisma.episode.findUnique({
      where: {
        seriesId_episodeNumber: {
          seriesId: parseInt(seriesId),
          episodeNumber: parseInt(episodeNumber),
        },
      },
    })

    if (!episode) return Response.json({ error: "Not found" }, { status: 404 })

    return Response.json(episode)
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
