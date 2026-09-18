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
export async function synthesizeEdge({ text, lang = "en", voice } = {}) {
  const trimmed = String(text || "").trim()
  if (!trimmed) throw new Error("Narration text is empty")
  const chosen = voice || getNeuralVoiceForLang(lang)

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
      if (msg.includes("No module named 'edge_tts'") || msg.includes("ModuleNotFoundError")) {
        throw new Error(
          "edge-tts is not installed. Run: pip3 install -r requirements-tts.txt (free, no API key).",
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
