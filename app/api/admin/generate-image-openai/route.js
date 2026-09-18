export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"
import OpenAI from "openai"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { prompt } = body
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 })

  const { openaiApiKey } = await getAIConfig()
  if (!openaiApiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 })

  try {
    const client = new OpenAI({ apiKey: openaiApiKey })
    const result = await client.images.generate({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1024x1536",
    })
    const base64 = result.data[0].b64_json
    return Response.json({ image_url: `data:image/png;base64,${base64}` })
  } catch (err) {
    console.error("OpenAI image generation error:", err)
    const msg = err?.message || "Image generation failed"
    if (msg.includes("safety") || msg.includes("policy") || msg.includes("content_policy")) {
      return Response.json(
        { error: "Blocked by content policy. Try modifying the description.", code: "CONTENT_BLOCKED" },
        { status: 400 }
      )
    }
    return Response.json({ error: msg }, { status: 500 })
  }
}
