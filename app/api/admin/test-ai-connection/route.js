export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"

export async function POST(req) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { service } = await req.json()
  if (!["anthropic", "openai", "google", "leonardo", "qwen"].includes(service)) {
    return Response.json({ error: "Invalid service" }, { status: 400 })
  }

  const config = await getAIConfig()

  try {
    if (service === "anthropic") {
      if (!config.anthropicApiKey) {
        return Response.json({ ok: false, error: "No Anthropic API key configured" })
      }
      const client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 10_000 })
      const models = await client.models.list({ limit: 1 })
      const first = models.data?.[0]?.id || "unknown"
      return Response.json({ ok: true, info: first })
    }

    if (service === "openai") {
      if (!config.openaiApiKey) {
        return Response.json({ ok: false, error: "No OpenAI API key configured" })
      }
      const client = new OpenAI({ apiKey: config.openaiApiKey, timeout: 10_000 })
      const models = await client.models.list()
      const first = models.data?.[0]?.id || "ok"
      return Response.json({ ok: true, info: first })
    }

    if (service === "google") {
      if (!config.googleApiKey) {
        return Response.json({ ok: false, error: "No Google API key configured" })
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${config.googleApiKey}&pageSize=1`,
        { signal: AbortSignal.timeout(10_000) }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return Response.json({ ok: false, error: err?.error?.message || `HTTP ${res.status}` })
      }
      const data = await res.json()
      const first = data.models?.[0]?.displayName || "ok"
      return Response.json({ ok: true, info: first })
    }

    if (service === "leonardo") {
      if (!config.leonardoApiKey) {
        return Response.json({ ok: false, error: "No Leonardo API key configured" })
      }
      const res = await fetch("https://cloud.leonardo.ai/api/rest/v1/me", {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.leonardoApiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return Response.json({ ok: false, error: err?.error || `HTTP ${res.status}` })
      }
      const data = await res.json()
      const username = data.user_details?.[0]?.user?.username || "ok"
      return Response.json({ ok: true, info: username })
    }
    if (service === "qwen") {
      if (!config.qwenApiKey) {
        return Response.json({ ok: false, error: "No Qwen API key configured" })
      }
      const res = await fetch(
        "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.qwenApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen-image-2.0",
            input: { messages: [{ role: "user", content: [{ type: "text", text: "test" }] }] },
            parameters: { size: "512*512", n: 1 },
          }),
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (res.status === 401) {
        return Response.json({ ok: false, error: "Invalid Qwen API key" })
      }
      const data = await res.json().catch(() => ({}))
      // Success: image returned
      if (data.output?.choices?.[0]?.message?.content?.[0]?.image) {
        return Response.json({ ok: true, info: "qwen-image-2.0 connected" })
      }
      // Key valid but some other API error (quota, etc.)
      if (res.status !== 401) {
        return Response.json({ ok: true, info: data.message || "Key accepted" })
      }
      return Response.json({ ok: false, error: data.message || `HTTP ${res.status}` })
    }
  } catch (err) {
    const msg = err?.status === 401 ? "Invalid API key" : (err?.message || "Connection failed")
    return Response.json({ ok: false, error: msg })
  }
}
