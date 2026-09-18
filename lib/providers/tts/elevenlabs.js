import { getElevenLabsVoiceIdForLang } from "./voices.js"

/**
 * Optional paid path. Not the default. Requires ELEVENLABS_API_KEY.
 * @param {{ text: string, lang?: string, voiceId?: string }} opts
 */
export async function synthesizeElevenLabs({ text, lang = "en", voiceId } = {}) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error("TTS_ENGINE=elevenlabs but ELEVENLABS_API_KEY is not set")
  }
  const trimmed = String(text || "").trim()
  if (!trimmed) throw new Error("Narration text is empty")
  const id = voiceId || getElevenLabsVoiceIdForLang(lang)

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}/with-timestamps`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: trimmed,
      model_id: lang === "en" ? "eleven_turbo_v2" : "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status))
    throw new Error(`ElevenLabs TTS failed: ${err}`)
  }

  const json = await res.json()
  const buffer = Buffer.from(json.audio_base64, "base64")
  const endTimes = json.alignment?.character_end_times_seconds || []
  const durationSec = endTimes.length > 0
    ? Math.ceil((endTimes[endTimes.length - 1] + 0.3) * 10) / 10
    : null

  return {
    buffer,
    mimeType: "audio/mpeg",
    durationSec,
    engine: "elevenlabs",
    voice: id,
  }
}
