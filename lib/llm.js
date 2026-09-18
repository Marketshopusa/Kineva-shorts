import OpenAI from "openai"
import { GoogleGenAI } from "@google/genai"
import { getAIConfig } from "@/lib/getAIConfig"
import { blockedConfig, resolveContentRail } from "@/lib/content-rails"
import { loadSeriesRail } from "@/lib/series-rail"

const GOOGLE_MODEL    = "gemini-2.5-flash"

async function resolveTextProvider({ seriesId, series, contentRating }) {
  const id = seriesId || series?.id
  if (id) {
    const { rail } = await loadSeriesRail(id)
    return rail.textProvider
  }
  if (contentRating || series?.contentRating) {
    return resolveContentRail(contentRating || series.contentRating).textProvider
  }
  throw blockedConfig("text", "seriesId or contentRating required — refusing unrated LLM call")
}

/**
 * LLM dispatch from Series.contentRating (DB when seriesId is present).
 * Settings llmProvider is ignored for rated series so rails cannot be mixed.
 */
export async function callLLM({ system, user, maxTokens, timeout = 120_000, seriesId, series, contentRating } = {}) {
  const textProvider = await resolveTextProvider({ seriesId, series, contentRating })
  const config = await getAIConfig()

  if (textProvider === "gemini") {
    if (!config.googleApiKey) throw blockedConfig("text", "GOOGLE_API_KEY absent")
    const ai = new GoogleGenAI({ apiKey: config.googleApiKey })
    const genConfig = { maxOutputTokens: maxTokens }
    if (system) genConfig.systemInstruction = system
    const result = await ai.models.generateContent({
      model: GOOGLE_MODEL,
      contents: user,
      config: genConfig,
    })
    return { text: result.text || "", textProvider }
  }

  if (textProvider === "qwen") {
    if (!config.qwenApiKey) throw blockedConfig("text", "QWEN_API_KEY absent")
    const client = new OpenAI({
      apiKey: config.qwenApiKey,
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      timeout,
    })
    const messages = []
    if (system) messages.push({ role: "system", content: system })
    messages.push({ role: "user", content: user })
    const resp = await client.chat.completions.create({
      model: "qwen-plus",
      messages,
      max_tokens: maxTokens,
    })
    return { text: resp.choices[0].message.content || "", textProvider }
  }

  throw blockedConfig("text", `unsupported textProvider ${textProvider}`)
}
