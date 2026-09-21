export const dynamic = "force-dynamic";
import { visualIdentityStatus } from "@/lib/character-identity"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { masterCandidateFields } from "@/lib/elena-varela-master-server.js"

export async function GET(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const seriesId = searchParams.get("seriesId")

    if (!seriesId) return Response.json({ error: "seriesId is required" }, { status: 400 })
    const parsedSeriesId = parseInt(seriesId, 10)
    if (isNaN(parsedSeriesId)) return Response.json({ error: "Invalid seriesId" }, { status: 400 })

    const characters = await prisma.character.findMany({
      where: { seriesId: parsedSeriesId },
      orderBy: { createdAt: "asc" },
    })

    return Response.json(await Promise.all(characters.map(async (c) => ({
      ...c,
      visualIdentity: visualIdentityStatus(c),
      ...(await masterCandidateFields(c)),
    }))))
  } catch (error) {
    console.error("Characters GET error:", error)
    return Response.json({ error: "Failed to load characters" }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const data = await request.json()
    const postSeriesId = parseInt(data.seriesId, 10)
    if (isNaN(postSeriesId)) return Response.json({ error: "Invalid seriesId" }, { status: 400 })
    const character = await prisma.character.create({
      data: {
        seriesId: postSeriesId,
        name: data.name,
        role: data.role || null,
        appearance: data.appearance || null,
        personality: data.personality || null,
      },
    })

    return Response.json({ id: character.id })
  } catch (error) {
    console.error("Characters POST error:", error)
    return Response.json({ error: "Failed to create character" }, { status: 500 })
  }
}
