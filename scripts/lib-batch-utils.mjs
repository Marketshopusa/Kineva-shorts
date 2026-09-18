/**
 * Shared utilities for batch generation scripts.
 * Handles authentication (Cookie or CLI Key) and Series ID resolution.
 */

import { readFileSync } from "fs"
import "dotenv/config"

const BASE_URL = process.env.SCENARIX_URL || "http://localhost:3000"
const CLI_KEY  = process.env.CLI_API_KEY || "scenarix-local-key"

let COOKIE = ""
try {
  const raw = readFileSync("/tmp/scenarix-cookies.txt", "utf-8")
  const m = raw.match(/authjs\.session-token\s+(\S+)/)
  if (m) COOKIE = `authjs.session-token=${m[1]}`
} catch { /* ignore */ }
if (!COOKIE) COOKIE = process.env.SESSION_COOKIE || ""

export function getHeaders() {
  const headers = { "Content-Type": "application/json" }
  if (CLI_KEY) {
    headers["x-cli-key"] = CLI_KEY
  } else if (COOKIE) {
    headers["cookie"] = COOKIE
  }
  return headers
}

export async function resolveSeriesId(title = "Broken Signal") {
  const res = await fetch(`${BASE_URL}/api/admin/series`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to list series: ${res.status}`)
  const all = await res.json()
  const found = all.find(s => s.title === title)
  if (!found) throw new Error(`Series '${title}' not found. Run seed script first?`)
  return found.id
}

export async function loadSeriesAndChars(seriesId) {
  const [s, c] = await Promise.all([
    fetch(`${BASE_URL}/api/admin/series/${seriesId}`, { headers: getHeaders() }).then(r => r.json()),
    fetch(`${BASE_URL}/api/admin/characters?seriesId=${seriesId}`, { headers: getHeaders() }).then(r => r.json()),
  ])
  return { series: s, characters: c }
}

export async function runAutoPilot(series, characters, episodeNumber, direction, provider = "leonardo") {
  const payload = {
    series,
    characters,
    episodeNumber,
    direction,
    previousScreenplay: null,
    provider,
  }

  console.log(`\n${"─".repeat(60)}`)
  console.log(`▶ EPISODE ${episodeNumber} — auto-pilot starting...`)
  console.log(`${"─".repeat(60)}`)

  const res = await fetch(`${BASE_URL}/api/admin/auto-episode`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok || !res.body) {
    console.error(`  ✗ Failed to start auto-pilot: ${res.status}`)
    const err = await res.json().catch(() => ({}))
    console.error(`    Error: ${err.error || "Unknown"}`)
    return null
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let episodeId = null
  let score = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const blocks = buf.split("\n\n")
    buf = blocks.pop()

    for (const block of blocks) {
      const evtMatch  = block.match(/^event: (\w+)/)
      const dataMatch = block.match(/^data: (.+)$/m)
      if (!evtMatch || !dataMatch) continue
      const evt  = evtMatch[1]
      let data = {}
      try { data = JSON.parse(dataMatch[1]) } catch { continue }

      if (evt === "episode_created") {
        episodeId = data.episodeId
        console.log(`  ✓ Episode created (ID: ${episodeId})`)
      }
      if (evt === "stage") {
        console.log(`  → ${data.message}`)
      }
      if (evt === "image_done") {
        process.stdout.write(`  📷 ${data.done}/6 `)
        if (data.done === 6) process.stdout.write("\n")
      }
      if (evt === "image_error") {
        console.log(`  ⚠ Image ${data.index} error: ${String(data.error).slice(0, 80)}`)
      }
      if (evt === "score") {
        score = data.score
        const col = score.overall >= 8 ? "✨" : score.overall >= 6 ? "👍" : "⚠"
        console.log(`  ${col} Quality score: ${score.overall}/10  (tension:${score.scores.tension} voice:${score.scores.voice} cliff:${score.scores.cliffhanger} continuity:${score.scores.continuity} tone:${score.scores.tone})`)
      }
      if (evt === "error") {
        console.error(`  ✗ Auto-pilot error: ${data.message}`)
        return null
      }
      if (evt === "done") {
        console.log(`  ✅ Episode ${episodeNumber} complete!`)
        return { episodeId, score }
      }
    }
  }
  return { episodeId, score }
}
