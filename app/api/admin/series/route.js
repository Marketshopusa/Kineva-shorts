export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { normalizeRating } from "@/lib/content-rails"

export async function GET() {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const allSeries = await prisma.series.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { episodes: true } } },
    })

    const result = allSeries.map((s) => ({
      ...s,
      episodeCount: s._count.episodes,
      _count: undefined,
    }))

    return Response.json(result)
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const data = await request.json()
    const series = await prisma.series.create({
      data: {
        title: data.title,
        theme: data.theme,
        tone: data.tone || null,
        setting: data.setting || null,
        premise: data.premise || null,
        languages: data.languages || [],
        globalStylePrompt: data.globalStylePrompt || null,
        visualStyle: data.visualStyle || "cinematic",
        contentRating: normalizeRating(data.contentRating),
        ongoingPlotThreads: [],
        lastCliffhanger: "",
        episodeSummaries: [],
        seriesBible: { locations: [], keyEvents: [], worldRules: [] },
      },
    })

    return Response.json({ id: series.id })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
