export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"

// qwen-image-2.0 uses the synchronous multimodal-generation endpoint (messages format)
const QWEN_URL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
const QWEN_MODEL = "qwen-image-2.0"

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

  const { qwenApiKey } = await getAIConfig()
  if (!qwenApiKey) {
    return Response.json({ error: "QWEN_API_KEY not configured" }, { status: 500 })
  }

  try {
    const res = await fetch(QWEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qwenApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        input: {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
            },
          ],
        },
        parameters: { size: "576*1024", n: 1 },
      }),
      signal: AbortSignal.timeout(90_000),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.message || `Qwen API error (${res.status})`)
    }

    const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image
    if (!imageUrl) {
      throw new Error("No image URL in Qwen response")
    }

    // Fetch and convert to base64 (URL expires)
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) })
    const imgBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(imgBuffer).toString("base64")
    const contentType = imgRes.headers.get("content-type") || "image/png"

    return Response.json({ image_url: `data:${contentType};base64,${base64}` })
  } catch (err) {
    console.error("Qwen image generation error:", err)

    if (err.message?.includes("blocked") || err.message?.includes("safety") || err.message?.includes("sensitive")) {
      return Response.json(
        { error: "Image blocked by safety filters. Try modifying the description.", code: "CONTENT_BLOCKED" },
        { status: 400 }
      )
    }

    return Response.json({ error: err.message || "Image generation failed" }, { status: 500 })
  }
}
