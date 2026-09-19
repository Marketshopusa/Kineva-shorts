export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"
import { loadSeriesRail } from "@/lib/series-rail"
import { generateStillForRail } from "@/lib/still-for-rail"
import { jsonRailError } from "@/lib/http-rail-error"
import { assertAdapterMatchesRail } from "@/lib/content-rails"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { prompt, seriesId, referenceImageUrl, aspectRatio, metadata } = await request.json()
    if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 })
    if (!seriesId) return Response.json({ error: "seriesId required for image rail" }, { status: 400 })

    const { rail } = await loadSeriesRail(seriesId)
    assertAdapterMatchesRail(rail, "image", "fal")
    const config = await getAIConfig()
    const { dataUrl, provider } = await generateStillForRail(
      rail,
      { prompt, referenceImageUrl: referenceImageUrl || null, aspectRatio: aspectRatio || "9:16", metadata },
      config,
    )
    return Response.json({ image_url: dataUrl, provider, referenceImageUrl: referenceImageUrl || null })
  } catch (err) {
    return jsonRailError(err) || Response.json({ error: err.message || "Fal image failed" }, { status: 500 })
  }
}
