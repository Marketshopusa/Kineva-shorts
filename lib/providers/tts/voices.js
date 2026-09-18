/**
 * Generic neural narrator voices (Microsoft Edge TTS catalog).
 * These are stock neural voices, not celebrity clones. $0, no API key.
 * Override with TTS_VOICE_<LANG> in env (e.g. TTS_VOICE_ES=es-ES-AlvaroNeural).
 */

export const DEFAULT_NEURAL_VOICES = Object.freeze({
  en: "en-US-JennyNeural",
  es: "es-MX-DaliaNeural",
  tr: "tr-TR-EmelNeural",
  de: "de-DE-KatjaNeural",
  ar: "ar-SA-ZariyahNeural",
})

export const ELEVENLABS_FALLBACK_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"

export function getTtsEngine() {
  const raw = String(process.env.TTS_ENGINE || "edge").toLowerCase().trim()
  if (raw === "elevenlabs") return "elevenlabs"
  return "edge"
}

/**
 * @param {string} lang
 * @returns {string} Edge neural voice short name
 */
export function getNeuralVoiceForLang(lang) {
  const code = String(lang || "en").toLowerCase()
  const envKey = `TTS_VOICE_${code.toUpperCase()}`
  return process.env[envKey] || process.env.TTS_VOICE || DEFAULT_NEURAL_VOICES[code] || DEFAULT_NEURAL_VOICES.en
}

/**
 * ElevenLabs catalog id — only used when TTS_ENGINE=elevenlabs.
 * @param {string} lang
 */
export function getElevenLabsVoiceIdForLang(lang) {
  const code = String(lang || "en").toLowerCase()
  const key = `ELEVENLABS_VOICE_ID_${code.toUpperCase()}`
  return process.env[key] || process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_FALLBACK_VOICE_ID
}

export function listNeuralVoices() {
  return Object.fromEntries(
    Object.keys(DEFAULT_NEURAL_VOICES).map((lang) => [lang, getNeuralVoiceForLang(lang)]),
  )
}
