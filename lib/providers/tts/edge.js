import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { probeDurationSec } from "./probe-duration.js"
import { getNeuralVoiceForLang } from "./voices.js"

const PY_SYNTH = `#!/usr/bin/env python3
import argparse, asyncio, json, sys

async def _run(text, voice, out_path):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--text-file")
    args = parser.parse_args()
    if args.text_file:
        with open(args.text_file, encoding="utf-8") as fh:
            text = fh.read()
    else:
        text = sys.stdin.read()
    text = (text or "").strip()
    if not text:
        print("empty text", file=sys.stderr)
        return 2
    try:
        asyncio.run(_run(text, args.voice, args.out))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
`

export function pythonTtsEndpoint() {
  const explicit = String(process.env.KINEVA_TTS_URL || "").trim()
  if (explicit) return explicit.replace(/\/$/, "")
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  if (!host) return null
  const origin = host.startsWith("http") ? host : `https://${host}`
  return `${origin}/api/edge-tts`
}

export function shouldUseVercelPythonTts() {
  return Boolean(process.env.VERCEL && process.env.INTERNAL_TTS_SECRET)
}

function pythonBin() {
  return process.env.TTS_PYTHON || "python3"
}

function runPython(args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), args, { stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    let stdout = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`edge-tts timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on("data", (c) => { stdout += c })
    child.stderr.on("data", (c) => { stderr += c })
    child.on("error", (err) => {
      clearTimeout(timer)
      if (err?.code === "ENOENT") {
        reject(new Error(
          "EDGE_TTS_RUNTIME_BLOCKED: python3/edge-tts is not available in this runtime (Vercel serverless has no Python interpreter).",
        ))
        return
      }
      reject(err)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr.trim() || stdout.trim() || `edge-tts exited ${code}`))
    })
  })
}

/**
 * @param {{ text: string, lang?: string, voice?: string }} opts
 * @returns {Promise<{ buffer: Buffer, mimeType: string, durationSec: number|null, engine: string, voice: string }>}
 */
async function synthesizeEdgeViaPythonFunction({ text, voice }) {
  const secret = process.env.INTERNAL_TTS_SECRET
  const endpoint = pythonTtsEndpoint()
  if (!secret || !endpoint) {
    throw new Error(
      "EDGE_TTS_RUNTIME_BLOCKED: INTERNAL_TTS_SECRET or TTS endpoint missing on Vercel.",
    )
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 55_000)
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-tts-secret": secret,
      },
      body: JSON.stringify({ text, voice }),
      signal: controller.signal,
    })
    const buf = Buffer.from(await res.arrayBuffer())
    if (!res.ok) {
      let detail = ""
      try {
        detail = JSON.parse(buf.toString("utf8")).error || buf.toString("utf8")
      } catch {
        detail = buf.toString("utf8").slice(0, 300)
      }
      if (String(detail).includes("EDGE_TTS_VERCEL_PYTHON_BLOCKED") || res.status === 501) {
        throw new Error(`EDGE_TTS_VERCEL_PYTHON_BLOCKED: ${String(detail).slice(0, 300)}`)
      }
      throw new Error(`edge-tts python function failed (${res.status}): ${String(detail).slice(0, 300)}`)
    }
    if (!buf.length) throw new Error("edge-tts python function returned empty audio")
    const dir = await mkdtemp(join(tmpdir(), "kineva-tts-"))
    const outFile = join(dir, "out.mp3")
    try {
      await writeFile(outFile, buf)
      const durationSec = await probeDurationSec(outFile)
      return {
        buffer: buf,
        mimeType: "audio/mpeg",
        durationSec,
        engine: "edge",
        voice,
        via: "vercel-python",
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("EDGE_TTS_VERCEL_PYTHON_BLOCKED: python function timed out")
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function synthesizeEdge({ text, lang = "en", voice } = {}) {
  const trimmed = String(text || "").trim()
  if (!trimmed) throw new Error("Narration text is empty")
  const chosen = voice || getNeuralVoiceForLang(lang)

  if (shouldUseVercelPythonTts()) {
    return synthesizeEdgeViaPythonFunction({ text: trimmed, voice: chosen })
  }

  const dir = await mkdtemp(join(tmpdir(), "scenarix-tts-"))
  const textFile = join(dir, "in.txt")
  const outFile = join(dir, "out.mp3")
  const pyFile = join(dir, "synth.py")
  try {
    await writeFile(textFile, trimmed, "utf8")
    await writeFile(pyFile, PY_SYNTH, "utf8")
    try {
      await runPython([pyFile, "--voice", chosen, "--out", outFile, "--text-file", textFile])
    } catch (err) {
      const msg = String(err?.message || err)
      if (msg.includes("EDGE_TTS_RUNTIME_BLOCKED")) throw err
      if (
        msg.includes("No module named 'edge_tts'") ||
        msg.includes("ModuleNotFoundError") ||
        msg.includes("ENOENT")
      ) {
        const onVercel = Boolean(process.env.VERCEL)
        throw new Error(
          onVercel
            ? "EDGE_TTS_RUNTIME_BLOCKED: Vercel serverless has no python3/edge-tts; synthesizer uses spawn(python3)."
            : "edge-tts is not installed. Run: pip3 install -r requirements-tts.txt (free, no API key).",
        )
      }
      throw new Error(`edge-tts failed: ${msg}`)
    }
    const buffer = await readFile(outFile)
    if (!buffer.length) throw new Error("edge-tts returned empty audio")
    const durationSec = await probeDurationSec(outFile)
    return {
      buffer,
      mimeType: "audio/mpeg",
      durationSec,
      engine: "edge",
      voice: chosen,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
