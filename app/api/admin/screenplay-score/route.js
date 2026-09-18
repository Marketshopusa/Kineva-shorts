export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { callLLM } from "@/lib/llm"
import prisma from "@/lib/prisma"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { screenplay, series, characters, previousCliffhanger, episodeId } = body

    if (!screenplay || !series) {
      return Response.json({ error: "Missing screenplay or series" }, { status: 400 })
    }

    const sceneSummaries = screenplay
      .map((s, i) => `Scene ${i + 1} (${s.scene_type}): ${s.visual_description?.slice(0, 120) || ""} | Narration: ${(s.text_en || s.text || "").slice(0, 200)}`)
      .join("\n")

    const characterList = (characters || [])
      .map((c) => `${c.name} (${c.role}) — traits: ${c.personality?.traits?.join(", ") || "unknown"}, speech: ${c.personality?.speechPattern || "unknown"}`)
      .join("\n")

    const prompt = `You are a drama series quality evaluator. Score the following episode screenplay on EXACTLY these 5 dimensions, each from 1–10.

SERIES CONTEXT:
Title: ${series.title}
Tone: ${series.tone || "unspecified"}
Theme: ${series.theme || "unspecified"}
Previous cliffhanger: ${previousCliffhanger || "none (first episode)"}

CHARACTERS:
${characterList || "no characters listed"}

SCREENPLAY (6 scenes):
${sceneSummaries}

Score each dimension 1–10 and give ONE sentence of feedback. Return ONLY valid JSON, no markdown:

{
  "scores": {
    "tension": <1-10>,
    "voice": <1-10>,
    "cliffhanger": <1-10>,
    "continuity": <1-10>,
    "tone": <1-10>
  },
  "feedback": {
    "tension": "<one sentence>",
    "voice": "<one sentence>",
    "cliffhanger": "<one sentence>",
    "continuity": "<one sentence>",
    "tone": "<one sentence>"
  }
}

SCORING GUIDE:
- tension (Tension Arc): Does emotional intensity escalate from Scene 1 (hook) through Scene 6 (cliffhanger)?
- voice (Character Voice): Do characters speak distinctly according to their established speech patterns?
- cliffhanger (Cliffhanger Strength): Is the final scene genuinely unresolved, shocking, and compelling?
- continuity (Continuity): Does the episode acknowledge the previous cliffhanger and weave in active plot threads?
- tone (Tonal Match): Does the episode feel consistent with the series' defined tone ("${series.tone || "dramatic"}")?`

    const { text } = await callLLM({ user: prompt, maxTokens: 512, timeout: 60_000, seriesId: series.id, series })

    let result
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned)
    } catch {
      return Response.json({ error: "Failed to parse scoring response" }, { status: 500 })
    }

    // Compute overall average
    const scoreValues = Object.values(result.scores || {})
    const overall = scoreValues.length
      ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
      : 0

    const scoreData = { ...result, overall }

    // Persist to episode if episodeId provided
    if (episodeId) {
      await prisma.episode.update({
        where: { id: Number(episodeId) },
        data: { qualityScore: scoreData },
      }).catch(() => {}) // non-critical
    }

    return Response.json(scoreData)
  } catch (err) {
    console.error("Screenplay scoring error:", err.message || err)
    return Response.json({ error: "Scoring failed" }, { status: 500 })
  }
}
