export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { callLLM } from "@/lib/llm"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { series, characters, episodeNumber, lastCliffhanger, ongoingPlotThreads } = await request.json()

    if (!series) return Response.json({ error: "series is required" }, { status: 400 })

    const charList = (characters || []).map((c) => `${c.name} (${c.role})`).join(", ")
    const threads  = (ongoingPlotThreads || []).join("; ") || "none"
    const cliff    = lastCliffhanger || "none"

    const prompt = `You are a drama series writer. Suggest 3 short episode direction ideas.

Series: "${series.title}"
Theme: ${series.theme}
Tone: ${series.tone || "dramatic"}
Episode: ${episodeNumber}
Characters: ${charList || "not specified"}
Last cliffhanger: ${cliff}
Active plot threads: ${threads}

Generate exactly 3 concise episode direction suggestions (1-2 sentences each).
Each should feel dramatically different in tone or focus.
Return as a JSON array of strings — no markdown, no commentary.
Example: ["Direction A", "Direction B", "Direction C"]`

    const { text } = await callLLM({ user: prompt, maxTokens: 512, timeout: 30_000, seriesId: series.id, series })

    let suggestions
    try {
      const match = text.match(/\[[\s\S]*\]/)
      suggestions = match ? JSON.parse(match[0]) : JSON.parse(text)
    } catch {
      return Response.json({ error: "Failed to parse suggestions" }, { status: 500 })
    }

    if (!Array.isArray(suggestions)) {
      return Response.json({ error: "Invalid response format" }, { status: 500 })
    }

    return Response.json({ suggestions: suggestions.slice(0, 3) })
  } catch (err) {
    console.error("Suggest direction error:", err)
    return Response.json({ error: "Suggestion failed" }, { status: 500 })
  }
}
