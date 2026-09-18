export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { buildSummaryPrompt } from "@/lib/buildClaudePrompt"
import { callLLM } from "@/lib/llm"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { screenplay, seriesTitle, episodeNumber, seriesId } = await request.json()

    const prompt = buildSummaryPrompt(screenplay, seriesTitle, episodeNumber)
    const { text } = await callLLM({ user: prompt, maxTokens: 1024, seriesId })

    let summary
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      summary = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      return Response.json(
        { error: "Failed to parse summary response" },
        { status: 500 }
      )
    }

    return Response.json(summary)
  } catch (err) {
    console.error("Summarization error:", err)
    return Response.json({ error: "Summarization failed" }, { status: 500 })
  }
}
