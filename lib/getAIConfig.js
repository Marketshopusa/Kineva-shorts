import prisma from "@/lib/prisma"
import { getTtsEngine, getElevenLabsVoiceIdForLang } from "@/lib/providers/tts/voices"

/**
 * Returns the ElevenLabs voice ID for a specific language.
 * Only used when TTS_ENGINE=elevenlabs. Default narrator path is edge-tts.
 */
export function getVoiceIdForLang(lang) {
  return getElevenLabsVoiceIdForLang(lang)
}

/**
 * Returns the active AI API configuration.
 * API keys always come from .env — never stored in the DB.
 * Non-secret settings (providers, model IDs) are read from DB with .env fallback.
 */
export async function getAIConfig() {
  let settings = null
  try {
    settings = await prisma.siteSettings.findUnique({ where: { id: 1 } })
  } catch {
    // If DB is unavailable, fall back to env vars
  }

  return {
    // API keys — env only
    anthropicApiKey:  process.env.ANTHROPIC_API_KEY  || "",
    googleApiKey:     process.env.GOOGLE_API_KEY     || "",
    leonardoApiKey:   process.env.LEONARDO_API_KEY   || "",
    openaiApiKey:     process.env.OPENAI_API_KEY     || "",
    qwenApiKey:       process.env.QWEN_API_KEY       || "",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "",
    // Non-secret settings — DB with env fallback
    leonardoModelId:      settings?.leonardoModelId      || process.env.LEONARDO_MODEL_ID      || undefined,
    llmProvider:          settings?.llmProvider          || process.env.LLM_PROVIDER           || "anthropic",
    defaultImageProvider: settings?.defaultImageProvider || process.env.DEFAULT_IMAGE_PROVIDER || "gemini",
    geminiImageModel:     settings?.geminiImageModel     || process.env.GEMINI_IMAGE_MODEL     || "gemini-2.5-flash-lite",
    elevenLabsVoiceId:    settings?.elevenLabsVoiceId    || process.env.ELEVENLABS_VOICE_ID    || "",
    ttsEngine:            getTtsEngine(),
  }
}
