export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const data = await request.json()
    const episode = await prisma.episode.create({
      data: {
        seriesId: parseInt(data.seriesId),
        episodeNumber: parseInt(data.episodeNumber),
        title: data.title || null,
        status: data.status || "setup",
        direction: data.direction || null,
        screenplay: data.screenplay || null,
      },
    })

    return Response.json({ id: episode.id })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
