export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { normalizeRating, resolveContentRail, inspectRailReadiness } from "@/lib/content-rails"
import { railPayload } from "@/lib/series-rail"

const ALLOWED_SERIES_FIELDS = [
  "title", "theme", "tone", "setting", "premise", "languages",
  "globalStylePrompt", "visualStyle", "contentRating", "ongoingPlotThreads", "pinnedThreads", "lastCliffhanger",
  "episodeSummaries", "seriesBible", "published",
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
    const seriesId = parseInt(id, 10)
    if (isNaN(seriesId)) return Response.json({ error: "Invalid id" }, { status: 400 })
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
    })

    if (!series) return Response.json({ error: "Not found" }, { status: 404 })

    const rail = resolveContentRail(series.contentRating)
    return Response.json({ ...series, contentRail: railPayload(rail, inspectRailReadiness(rail)) })
  } catch (error) {
    console.error("Series GET error:", error)
    return Response.json({ error: "Failed to load series" }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const seriesId = parseInt(id, 10)
    if (isNaN(seriesId)) return Response.json({ error: "Invalid id" }, { status: 400 })
    const body = await request.json()
    const data = pick(body, ALLOWED_SERIES_FIELDS)
    if ("contentRating" in data) data.contentRating = normalizeRating(data.contentRating)

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 })
    }

    const series = await prisma.series.update({
      where: { id: seriesId },
      data,
    })

    return Response.json(series)
  } catch (error) {
    console.error("Series PUT error:", error)
    return Response.json({ error: "Failed to update series" }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const seriesId = parseInt(id, 10)
    if (isNaN(seriesId)) return Response.json({ error: "Invalid id" }, { status: 400 })
    await prisma.series.delete({
      where: { id: seriesId },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error("Series DELETE error:", error)
    return Response.json({ error: "Failed to delete series" }, { status: 500 })
  }
}
