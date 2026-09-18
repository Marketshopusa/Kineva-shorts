import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_NEURAL_VOICES,
  getTtsEngine,
  getNeuralVoiceForLang,
  getElevenLabsVoiceIdForLang,
  listNeuralVoices,
} from "../../lib/providers/tts/voices.js"

test("default engine is edge, not elevenlabs", () => {
  const prev = process.env.TTS_ENGINE
  delete process.env.TTS_ENGINE
  assert.equal(getTtsEngine(), "edge")
  process.env.TTS_ENGINE = "ELEVENLABS"
  assert.equal(getTtsEngine(), "elevenlabs")
  process.env.TTS_ENGINE = "piper"
  assert.equal(getTtsEngine(), "edge")
  if (prev === undefined) delete process.env.TTS_ENGINE
  else process.env.TTS_ENGINE = prev
})

test("Spanish default is a Microsoft neural catalog voice", () => {
  const prev = process.env.TTS_VOICE_ES
  delete process.env.TTS_VOICE_ES
  assert.equal(getNeuralVoiceForLang("es"), "es-MX-DaliaNeural")
  assert.match(getNeuralVoiceForLang("es"), /Neural$/)
  assert.equal(DEFAULT_NEURAL_VOICES.es, "es-MX-DaliaNeural")
  if (prev === undefined) delete process.env.TTS_VOICE_ES
  else process.env.TTS_VOICE_ES = prev
})

test("TTS_VOICE_LANG overrides neural name without using ElevenLabs ids", () => {
  process.env.TTS_VOICE_ES = "es-ES-ElviraNeural"
  assert.equal(getNeuralVoiceForLang("es"), "es-ES-ElviraNeural")
  delete process.env.TTS_VOICE_ES
  const eleven = getElevenLabsVoiceIdForLang("es")
  assert.notEqual(getNeuralVoiceForLang("es"), eleven)
})

test("listNeuralVoices covers en and es", () => {
  const list = listNeuralVoices()
  assert.ok(list.en)
  assert.ok(list.es)
})
