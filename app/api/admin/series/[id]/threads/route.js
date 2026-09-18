export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"

/**
 * PATCH /api/admin/series/[id]/threads
 * Manage plot threads for a series.
 *
 * Body: { action: "resolve" | "pin" | "unpin" | "delete", threadIndex: number }
 */
export async function PATCH(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const seriesId = Number((await params).id)
  const { action, threadIndex } = await request.json()

  if (!["resolve", "pin", "unpin", "delete"].includes(action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 })
  }
  if (typeof threadIndex !== "number") {
    return Response.json({ error: "threadIndex is required" }, { status: 400 })
  }

  try {
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      select: { ongoingPlotThreads: true, pinnedThreads: true },
    })
    if (!series) return Response.json({ error: "Series not found" }, { status: 404 })

    const threads = Array.isArray(series.ongoingPlotThreads) ? series.ongoingPlotThreads : []
    const pinned  = Array.isArray(series.pinnedThreads) ? series.pinnedThreads : []
    const thread  = threads[threadIndex]

    if (!thread && action !== "delete") {
      return Response.json({ error: "Thread not found" }, { status: 404 })
    }

    let updatedThreads = [...threads]
    let updatedPinned  = [...pinned]

    if (action === "resolve" || action === "delete") {
      updatedThreads = threads.filter((_, i) => i !== threadIndex)
      updatedPinned  = pinned.filter((t) => t !== thread)
    } else if (action === "pin") {
      if (!updatedPinned.includes(thread)) updatedPinned.push(thread)
    } else if (action === "unpin") {
      updatedPinned = pinned.filter((t) => t !== thread)
    }

    const updated = await prisma.series.update({
      where: { id: seriesId },
      data: { ongoingPlotThreads: updatedThreads, pinnedThreads: updatedPinned },
      select: { ongoingPlotThreads: true, pinnedThreads: true },
    })

    return Response.json({ ongoingPlotThreads: updated.ongoingPlotThreads, pinnedThreads: updated.pinnedThreads })
  } catch (err) {
    console.error("Thread mutation error:", err.message)
    return Response.json({ error: "Failed to update threads" }, { status: 500 })
  }
}
