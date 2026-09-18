export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"

/**
 * PUT /api/admin/characters/[id]/reference
 * Lock a visual reference image for a character.
 * Body: { imageUrl: string, episodeNumber: number }
 */
export async function PUT(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)
  const { imageUrl, episodeNumber } = await request.json()

  if (!imageUrl) return Response.json({ error: "imageUrl is required" }, { status: 400 })

  try {
    const updated = await prisma.character.update({
      where: { id: charId },
      data: { referenceImageUrl: imageUrl, referenceEpisode: episodeNumber || null },
      select: { id: true, name: true, referenceImageUrl: true, referenceEpisode: true },
    })
    return Response.json(updated)
  } catch (err) {
    console.error("Set reference error:", err.message)
    return Response.json({ error: "Failed to set reference" }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/characters/[id]/reference
 * Clear the visual reference image for a character.
 */
export async function DELETE(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)

  try {
    const updated = await prisma.character.update({
      where: { id: charId },
      data: { referenceImageUrl: null, referenceEpisode: null },
      select: { id: true, name: true, referenceImageUrl: true },
    })
    return Response.json(updated)
  } catch (err) {
    console.error("Clear reference error:", err.message)
    return Response.json({ error: "Failed to clear reference" }, { status: 500 })
  }
}
