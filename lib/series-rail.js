import prisma from "@/lib/prisma"
import { inspectRailReadiness, resolveContentRail } from "@/lib/content-rails"

export async function loadSeriesRail(seriesId) {
  const id = parseInt(seriesId, 10)
  if (Number.isNaN(id)) {
    const err = new Error("Invalid seriesId for content rail")
    err.code = "UNKNOWN_RATING"
    throw err
  }
  const series = await prisma.series.findUnique({ where: { id } })
  if (!series) {
    const err = new Error("Series not found")
    err.code = "NOT_FOUND"
    throw err
  }
  const rail = resolveContentRail(series.contentRating)
  return { series, rail, readiness: inspectRailReadiness(rail) }
}

export function railPayload(rail, readiness) {
  return {
    id: rail.id,
    textProvider: rail.textProvider,
    imageProvider: rail.imageProvider,
    videoProvider: rail.videoProvider,
    voiceProvider: rail.voiceProvider,
    readiness,
  }
}
