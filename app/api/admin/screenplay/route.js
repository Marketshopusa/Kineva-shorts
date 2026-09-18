export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { buildScreenplaySystemPrompt, buildScreenplayUserPrompt } from "@/lib/buildClaudePrompt"
import { jsonRailError } from "@/lib/http-rail-error"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { series, characters, episodeNumber, direction, previousScreenplay } = body

    if (!series || !characters) {
      return Response.json({ error: "Missing series or characters data" }, { status: 400 })
    }

    const systemPrompt = buildScreenplaySystemPrompt({
      series,
      characters,
      languages: series.languages || ["en"],
    })

    const userPrompt = buildScreenplayUserPrompt({
      series,
      characters,
      episodeNumber: episodeNumber || 1,
      direction,
      previousScreenplay,
    })

    const { text } = await callLLM({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 4096,
      timeout: 120_000,
      seriesId: series.id,
      series,
    })

    // Parse JSON from response (handle potential markdown wrapping)
    let scenes
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      scenes = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      return Response.json(
        { error: "Failed to parse screenplay response" },
        { status: 500 }
      )
    }

    // Validate structure
    if (!Array.isArray(scenes) || scenes.length !== 6) {
      return Response.json(
        { error: `Expected 6 scenes, got ${Array.isArray(scenes) ? scenes.length : 'non-array'}`, scenes },
        { status: 500 }
      )
    }

    return Response.json({ scenes })
  } catch (err) {
    console.error("Screenplay generation error:", err.status || "", err.message || err)
    return jsonRailError(err) || Response.json(
      { error: err.message || "Screenplay generation failed" },
      { status: 500 }
    )
  }
}
