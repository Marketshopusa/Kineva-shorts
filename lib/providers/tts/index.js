import { synthesizeEdge } from "./edge.js"
import { synthesizeElevenLabs } from "./elevenlabs.js"
import { getTtsEngine, getNeuralVoiceForLang, getElevenLabsVoiceIdForLang, listNeuralVoices } from "./voices.js"

/**
 * Narrator TTS. Default engine is free Microsoft neural (edge-tts).
 * Set TTS_ENGINE=elevenlabs to opt into the paid provider later.
 *
 * @param {{ text: string, lang?: string }} opts
 */
export async function synthesizeNarration(opts) {
  const engine = getTtsEngine()
  if (engine === "elevenlabs") {
    return synthesizeElevenLabs(opts)
  }
  return synthesizeEdge(opts)
}

export {
  getTtsEngine,
  getNeuralVoiceForLang,
  getElevenLabsVoiceIdForLang,
  listNeuralVoices,
}
