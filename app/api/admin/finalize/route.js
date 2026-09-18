export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { episodeId, summaryData } = await request.json()

    const epId = parseInt(episodeId)
    const episode = await prisma.episode.findUnique({ where: { id: epId } })
    if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 })

    // Update episode status and summary fields
    await prisma.episode.update({
      where: { id: epId },
      data: {
        status: "completed",
        summary: summaryData.summary,
        cliffhanger: summaryData.cliffhanger,
        plotThreadsIntroduced: summaryData.plotThreadsIntroduced || [],
        plotThreadsResolved: summaryData.plotThreadsResolved || [],
      },
    })

    // Update series
    const series = await prisma.series.findUnique({ where: { id: episode.seriesId } })
    if (!series) return Response.json({ error: "Series not found" }, { status: 404 })

    const newSummaries = [
      ...(series.episodeSummaries || []),
      {
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        summary: summaryData.summary,
      },
    ]

    const resolvedSet = new Set(summaryData.plotThreadsResolved || [])
    const existingThreads = (series.ongoingPlotThreads || []).filter(
      (t) => !resolvedSet.has(t)
    )
    const newThreads = [
      ...existingThreads,
      ...(summaryData.plotThreadsIntroduced || []),
    ]

    // Merge locations and key events into series bible
    const bible = series.seriesBible || {
      locations: [],
      keyEvents: [],
      worldRules: [],
    }
    if (summaryData.locationsUsed?.length) {
      const existingNames = new Set(
        bible.locations.map((l) => l.name.toLowerCase())
      )
      for (const loc of summaryData.locationsUsed) {
        if (!existingNames.has(loc.name.toLowerCase())) {
          bible.locations.push({
            ...loc,
            firstMentioned: episode.episodeNumber,
          })
          existingNames.add(loc.name.toLowerCase())
        }
      }
    }
    if (summaryData.keyEvents?.length) {
      for (const evt of summaryData.keyEvents) {
        bible.keyEvents.push({
          ...evt,
          episodeNumber: episode.episodeNumber,
        })
      }
    }

    await prisma.series.update({
      where: { id: episode.seriesId },
      data: {
        episodeSummaries: newSummaries,
        lastCliffhanger: summaryData.cliffhanger || "",
        ongoingPlotThreads: newThreads,
        seriesBible: bible,
      },
    })

    // Update character arc progressions
    if (summaryData.characterArcUpdates) {
      const characters = await prisma.character.findMany({
        where: { seriesId: episode.seriesId },
      })

      for (const [charName, arcUpdate] of Object.entries(
        summaryData.characterArcUpdates
      )) {
        const char = characters.find((c) => c.name === charName)
        if (char) {
          const arcProgression = [
            ...(char.personality?.arcProgression || []),
            { episode: episode.episodeNumber, state: arcUpdate },
          ]
          await prisma.character.update({
            where: { id: char.id },
            data: {
              personality: { ...char.personality, arcProgression },
            },
          })
        }
      }
    }

    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
