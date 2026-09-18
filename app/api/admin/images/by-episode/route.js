export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function GET(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const episodeId = searchParams.get("episodeId")

    if (!episodeId) return Response.json({ error: "episodeId is required" }, { status: 400 })

    const images = await prisma.image.findMany({
      where: { episodeId: parseInt(episodeId) },
      orderBy: { sceneIndex: "asc" },
    })

    return Response.json(images)
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
