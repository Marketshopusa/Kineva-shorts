import test from "node:test"
import assert from "node:assert/strict"
import { pythonTtsEndpoint, shouldUseVercelPythonTts } from "../../lib/providers/tts/edge.js"

test("python TTS endpoint is not used off Vercel", () => {
  const prevV = process.env.VERCEL
  const prevS = process.env.INTERNAL_TTS_SECRET
  delete process.env.VERCEL
  process.env.INTERNAL_TTS_SECRET = "x"
  assert.equal(shouldUseVercelPythonTts(), false)
  if (prevV === undefined) delete process.env.VERCEL
  else process.env.VERCEL = prevV
  if (prevS === undefined) delete process.env.INTERNAL_TTS_SECRET
  else process.env.INTERNAL_TTS_SECRET = prevS
})

test("python TTS endpoint builds from VERCEL_URL", () => {
  const prev = process.env.KINEVA_TTS_URL
  const prevHost = process.env.VERCEL_URL
  delete process.env.KINEVA_TTS_URL
  process.env.VERCEL_URL = "kineva-preview.vercel.app"
  assert.equal(pythonTtsEndpoint(), "https://kineva-preview.vercel.app/api/edge-tts")
  if (prev === undefined) delete process.env.KINEVA_TTS_URL
  else process.env.KINEVA_TTS_URL = prev
  if (prevHost === undefined) delete process.env.VERCEL_URL
  else process.env.VERCEL_URL = prevHost
})
