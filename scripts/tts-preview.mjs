#!/usr/bin/env node
/**
 * Generate a $0 neural narrator sample (edge-tts). No API keys.
 *
 *   node scripts/tts-preview.mjs --lang es --out /tmp/narrator-es.mp3
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { synthesizeNarration, getTtsEngine, getNeuralVoiceForLang } from "../lib/providers/tts/index.js"

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const lang = flag("lang", "es")
const out = resolve(flag("out", `./tmp/tts-preview-${lang}.mp3`))
const text = flag(
  "text",
  lang === "es"
    ? "En una ciudad costera, la narradora describe el puerto al amanecer."
    : "In a coastal city, the narrator describes the harbor at dawn.",
)

if (getTtsEngine() === "elevenlabs") {
  console.error("Refusing: TTS_ENGINE=elevenlabs. Unset it to preview the free neural engine.")
  process.exit(2)
}

const result = await synthesizeNarration({ text, lang })
await mkdir(dirname(out), { recursive: true })
await writeFile(out, result.buffer)
console.log(JSON.stringify({
  engine: result.engine,
  voice: result.voice || getNeuralVoiceForLang(lang),
  lang,
  durationSec: result.durationSec,
  bytes: result.buffer.length,
  out,
}, null, 2))
