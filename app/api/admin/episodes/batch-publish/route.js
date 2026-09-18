export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

// POST /api/admin/episodes/batch-publish
// Body: { episodeIds: number[], published: boolean }
// Publishes or unpublishes a batch of episodes (used for arc-level toggle).
export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { episodeIds, published } = await request.json()

    if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
      return Response.json({ error: "episodeIds must be a non-empty array" }, { status: 400 })
    }
    if (typeof published !== "boolean") {
      return Response.json({ error: "published must be a boolean" }, { status: 400 })
    }

    const { count } = await prisma.episode.updateMany({
      where: { id: { in: episodeIds.map(Number) } },
      data: { published },
    })

    return Response.json({ updated: count, published })
  } catch (err) {
    console.error("Batch publish error:", err)
    return Response.json({ error: "Failed to batch publish" }, { status: 500 })
  }
}
