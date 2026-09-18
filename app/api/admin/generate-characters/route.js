export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { jsonRailError } from "@/lib/http-rail-error"
import { callLLM } from "@/lib/llm"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { title, theme, tone, setting, premise, contentRating } = await request.json()

    if (!title || !theme) {
      return Response.json({ error: "title and theme are required" }, { status: 400 })
    }

    const prompt = `You are a creative writer for short-form vertical drama series.

Generate 3-4 compelling characters for this series:
- Title: ${title}
- Theme: ${theme}
- Tone: ${tone || "dramatic"}
- Setting: ${setting || "contemporary"}
- Premise: ${premise || "A drama series with complex characters and emotional storylines."}

Return a JSON array with exactly 3-4 characters. Each character MUST follow this exact schema:
{
  "name": "Full Name",
  "role": "protagonist" | "antagonist" | "supporting",
  "appearance": {
    "basePrompt": "A detailed visual description suitable for AI image generation (age, ethnicity, facial features, hair, build — 1-2 sentences)",
    "wardrobeDefault": "Typical outfit description",
    "distinguishingFeatures": "Unique visual traits"
  },
  "personality": {
    "traits": ["trait1", "trait2", "trait3"],
    "speechPattern": "How they speak (e.g. 'speaks in short bursts, rarely shows emotion')",
    "backstory": "2-3 sentence backstory",
    "motivations": ["primary motivation", "secondary motivation"],
    "relationships": {},
    "arcProgression": []
  }
}

Rules:
- Include exactly 1 protagonist and 1 antagonist
- Characters should feel grounded and emotionally complex
- Appearance basePrompt should be specific enough for image generation
- Return ONLY the JSON array, no markdown, no commentary`

    const { text } = await callLLM({ user: prompt, maxTokens: 2048, timeout: 60_000, contentRating })

    let characters
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      characters = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      return Response.json({ error: "Failed to parse character response" }, { status: 500 })
    }

    if (!Array.isArray(characters) || characters.length < 3) {
      return Response.json({ error: "Expected 3-4 characters" }, { status: 500 })
    }

    return Response.json({ characters })
  } catch (err) {
    console.error("Character generation error:", err)
    return jsonRailError(err) || Response.json({ error: err.message || "Character generation failed" }, { status: 500 })
  }
}
