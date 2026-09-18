/**
 * Scenarix MCP Server
 *
 * Exposes episode creation and series management as MCP tools so Claude Code
 * can create episodes conversationally — with dynamic directions, quality
 * feedback loops, and no batch scripts needed.
 *
 * Usage:
 *   node mcp/server.mjs
 *
 * Configure in .claude/mcp.json (project-level) or ~/.claude/mcp.json (global).
 * Requires the Scenarix Next.js app to be running at SCENARIX_URL.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { readFileSync } from "fs"

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.SCENARIX_URL || "http://localhost:3000"

// Auth strategy (in priority order):
// 1. CLI_API_KEY env var or .env.local file  → x-cli-key header (no browser needed)
// 2. /tmp/scenarix-cookies.txt  → session cookie (legacy)
// 3. SESSION_COOKIE env var  → session cookie (legacy)

// Read .env.local to pick up CLI_API_KEY even when Claude Code doesn't forward env
function readEnvLocal() {
  try {
    const dir = new URL("../", import.meta.url).pathname
    const raw = readFileSync(`${dir}.env.local`, "utf-8")
    const m = raw.match(/^CLI_API_KEY=(.+)$/m)
    return m ? m[1].trim() : ""
  } catch { return "" }
}

const CLI_KEY = process.env.CLI_API_KEY || readEnvLocal()

let COOKIE = ""
if (!CLI_KEY) {
  try {
    const raw = readFileSync("/tmp/scenarix-cookies.txt", "utf-8")
    const m = raw.match(/authjs\.session-token\s+(\S+)/)
    if (m) COOKIE = `authjs.session-token=${m[1]}`
  } catch {
    // fall back to env var if cookie file missing
  }
  if (!COOKIE) COOKIE = process.env.SESSION_COOKIE || ""
}

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra }
  if (CLI_KEY) {
    h["x-cli-key"] = CLI_KEY
  } else if (COOKIE) {
    h["cookie"] = COOKIE
  }
  return h
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status} on ${path}`)
  }
  return res.json()
}

// ─── SSE consumer for auto-episode ────────────────────────────────────────────

async function runAutoPilot({ series, characters, episodeNumber, direction, provider = "leonardo", prewrittenScreenplay = null }) {
  const payload = { series, characters, episodeNumber, direction: direction || null, previousScreenplay: null, provider, prewrittenScreenplay }

  const res = await fetch(`${BASE_URL}/api/admin/auto-episode`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  })

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Auto-pilot HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let episodeId = null
  let score = null
  const stageLog = []

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
      const evt = evtMatch[1]
      let data = {}
      try { data = JSON.parse(dataMatch[1]) } catch { continue }

      if (evt === "episode_created") episodeId = data.episodeId
      if (evt === "stage")           stageLog.push(data.message)
      if (evt === "score")           score = data.score
      if (evt === "error")           throw new Error(data.message || "Auto-pilot error")
      if (evt === "done")            break
    }
  }

  return { episodeId, score, stageLog }
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "scenarix",
  version: "1.0.0",
})

// ── Tool: create_series ───────────────────────────────────────────────────────
server.tool(
  "create_series",
  "Create a new drama series in Scenarix. Returns the new series ID. Call this first, then create_character for each character.",
  {
    title:             z.string().describe("Series title"),
    theme:             z.string().describe("Core theme keyword, e.g. hidden_identity, betrayal, revenge"),
    tone:              z.string().optional().describe("Emotional tone, e.g. romantic, tense, dark, sophisticated"),
    setting:           z.string().optional().describe("Story world / location description"),
    premise:           z.string().optional().describe("Series premise / synopsis"),
    languages:         z.array(z.string()).optional().describe("Language codes, e.g. ['en','tr']"),
    visualStyle:       z.string().optional().describe("Visual style key: cinematic, anime, noir, watercolor, comic_book, animation_3d, vintage, hand_drawn"),
    globalStylePrompt: z.string().optional().describe("Extra style guidance injected into every image prompt"),
  },
  async (args) => {
    const result = await api("/api/admin/series", {
      method: "POST",
      body: JSON.stringify({
        title:             args.title,
        theme:             args.theme,
        tone:              args.tone || null,
        setting:           args.setting || null,
        premise:           args.premise || null,
        languages:         args.languages || ["en"],
        visualStyle:       args.visualStyle || "cinematic",
        globalStylePrompt: args.globalStylePrompt || null,
      }),
    })
    return { content: [{ type: "text", text: `✅ Series created — ID: ${result.id}\nTitle: ${args.title}\n\nNext step: call create_character for each character, passing seriesId: ${result.id}` }] }
  }
)

// ── Tool: create_character ────────────────────────────────────────────────────
server.tool(
  "create_character",
  "Add a character to a series. Call once per character after create_series. Appearance and personality are stored and injected into every image + screenplay prompt.",
  {
    seriesId:               z.number().describe("Series ID returned by create_series"),
    name:                   z.string().describe("Character name"),
    role:                   z.string().optional().describe("protagonist | antagonist | supporting"),
    appearancePrompt:       z.string().optional().describe("Visual description used in image prompts — be specific about age, hair, eyes, skin tone, build"),
    wardrobeDefault:        z.string().optional().describe("Default clothing / style description"),
    distinguishingFeatures: z.string().optional().describe("Unique physical features (scars, tattoos, etc.)"),
    traits:                 z.array(z.string()).optional().describe("Personality trait keywords, e.g. ['kind', 'secretive', 'brave']"),
    speechPattern:          z.string().optional().describe("How they speak — tone, rhythm, habits"),
    backstory:              z.string().optional().describe("Character history and background"),
    motivations:            z.array(z.string()).optional().describe("What drives them, e.g. ['escape poverty', 'protect family']"),
  },
  async (args) => {
    const result = await api("/api/admin/characters", {
      method: "POST",
      body: JSON.stringify({
        seriesId: args.seriesId,
        name:     args.name,
        role:     args.role || null,
        appearance: {
          basePrompt:             args.appearancePrompt || "",
          wardrobeDefault:        args.wardrobeDefault || "",
          distinguishingFeatures: args.distinguishingFeatures || "",
        },
        personality: {
          traits:         args.traits || [],
          speechPattern:  args.speechPattern || "",
          backstory:      args.backstory || "",
          motivations:    args.motivations || [],
          relationships:  {},
          arcProgression: [],
        },
      }),
    })
    return { content: [{ type: "text", text: `✅ Character created — ID: ${result.id}\nName: ${args.name} (${args.role || "no role set"})` }] }
  }
)

// ── Tool: list_series ─────────────────────────────────────────────────────────
server.tool(
  "list_series",
  "List all drama series in Scenarix with their episode count and last cliffhanger.",
  {},
  async () => {
    const series = await api("/api/admin/series")
    const rows = (Array.isArray(series) ? series : []).map((s) => ({
      id: s.id,
      title: s.title,
      theme: s.theme,
      tone: s.tone,
      episodeCount: Array.isArray(s.episodes) ? s.episodes.length : "?",
      lastCliffhanger: s.lastCliffhanger || "none",
      published: s.published,
    }))
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] }
  }
)

// ── Tool: get_series ──────────────────────────────────────────────────────────
server.tool(
  "get_series",
  "Get full state of a series: metadata, characters, active plot threads, pinned threads, last cliffhanger, episode summaries, and series bible. Call this before create_episode to understand the current story state.",
  { seriesId: z.number().describe("The series ID") },
  async ({ seriesId }) => {
    const [series, characters] = await Promise.all([
      api(`/api/admin/series/${seriesId}`),
      api(`/api/admin/characters?seriesId=${seriesId}`),
    ])
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          series: {
            id: series.id,
            title: series.title,
            theme: series.theme,
            tone: series.tone,
            setting: series.setting,
            premise: series.premise,
            languages: series.languages,
            visualStyle: series.visualStyle,
            lastCliffhanger: series.lastCliffhanger,
            pinnedThreads: series.pinnedThreads || [],
            ongoingPlotThreads: series.ongoingPlotThreads || [],
            episodeSummaries: series.episodeSummaries || [],
            seriesBible: series.seriesBible || {},
          },
          characters: characters.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            traits: c.personality?.traits,
            speechPattern: c.personality?.speechPattern,
            backstory: c.personality?.backstory,
            latestArc: c.personality?.arcProgression?.slice(-1)[0] || null,
          })),
        }, null, 2),
      }],
    }
  }
)

// ── Tool: list_episodes ───────────────────────────────────────────────────────
server.tool(
  "list_episodes",
  "List all episodes for a series with their status and quality scores. Use this to see what exists and identify gaps before creating new episodes.",
  { seriesId: z.number().describe("The series ID") },
  async ({ seriesId }) => {
    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const rows = (Array.isArray(episodes) ? episodes : []).map((ep) => ({
      number: ep.episodeNumber,
      id: ep.id,
      title: ep.title,
      status: ep.status,
      score: ep.qualityScore?.overall ?? null,
      cliffhanger: ep.cliffhanger?.slice(0, 120) || null,
    }))
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] }
  }
)

// ── Tool: get_episode ─────────────────────────────────────────────────────────
server.tool(
  "get_episode",
  "Get details of a specific episode including summary, cliffhanger, quality score breakdown, and plot threads.",
  {
    seriesId:      z.number().describe("The series ID"),
    episodeNumber: z.number().describe("The episode number"),
  },
  async ({ seriesId, episodeNumber }) => {
    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const ep = (Array.isArray(episodes) ? episodes : []).find((e) => e.episodeNumber === episodeNumber)
    if (!ep) throw new Error(`Episode ${episodeNumber} not found in series ${seriesId}`)
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: ep.id,
          number: ep.episodeNumber,
          title: ep.title,
          status: ep.status,
          summary: ep.summary,
          cliffhanger: ep.cliffhanger,
          plotThreadsIntroduced: ep.plotThreadsIntroduced,
          plotThreadsResolved: ep.plotThreadsResolved,
          qualityScore: ep.qualityScore,
        }, null, 2),
      }],
    }
  }
)

// ── Tool: suggest_direction ───────────────────────────────────────────────────
server.tool(
  "suggest_direction",
  "Generate 3 AI-suggested episode direction ideas based on the current series state (cliffhanger, threads, characters). Use this to brainstorm before calling create_episode.",
  { seriesId: z.number().describe("The series ID") },
  async ({ seriesId }) => {
    const [series, characters] = await Promise.all([
      api(`/api/admin/series/${seriesId}`),
      api(`/api/admin/characters?seriesId=${seriesId}`),
    ])
    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const nextEpisodeNumber = (episodes.length || 0) + 1

    const result = await api("/api/admin/suggest-direction", {
      method: "POST",
      body: JSON.stringify({
        series,
        characters,
        episodeNumber: nextEpisodeNumber,
        lastCliffhanger: series.lastCliffhanger,
        ongoingPlotThreads: series.ongoingPlotThreads,
      }),
    })

    return {
      content: [{
        type: "text",
        text: `Next episode: #${nextEpisodeNumber}\n\nSuggested directions:\n${
          (result.suggestions || []).map((s, i) => `${i + 1}. ${s}`).join("\n\n")
        }`,
      }],
    }
  }
)

// ── Tool: create_episode ──────────────────────────────────────────────────────
server.tool(
  "create_episode",
  "Generate a complete episode (screenplay + images + finalize). Fetches current series state automatically. Returns episode ID, quality score, and cliffhanger when done. Takes 3-5 minutes — Claude Code will wait.",
  {
    seriesId:      z.number().describe("The series ID"),
    episodeNumber: z.number().describe("The episode number to create"),
    direction:     z.string().optional().describe("Creative direction / synopsis for this episode. If omitted, Claude generates freely based on series state."),
    provider:      z.enum(["gemini", "qwen", "openai", "leonardo", "leonardo-nano", "leonardo-gpt2"]).default("qwen").describe("Image generation provider (default: qwen)"),
  },
  async ({ seriesId, episodeNumber, direction, provider }) => {
    // Load fresh series state each time so we get latest cliffhanger + threads
    const [series, characters] = await Promise.all([
      api(`/api/admin/series/${seriesId}`),
      api(`/api/admin/characters?seriesId=${seriesId}`),
    ])

    process.stderr.write(`[scenarix] Creating episode ${episodeNumber} for "${series.title}"...\n`)

    const { episodeId, score, stageLog } = await runAutoPilot({
      series,
      characters,
      episodeNumber,
      direction,
      provider,
    })

    // Fetch the finalized episode for cliffhanger + summary
    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const ep = (Array.isArray(episodes) ? episodes : []).find((e) => e.episodeNumber === episodeNumber)

    const scoreStr = score
      ? `Overall: ${score.overall}/10 (tension:${score.scores?.tension} voice:${score.scores?.voice} cliff:${score.scores?.cliffhanger} continuity:${score.scores?.continuity} tone:${score.scores?.tone})`
      : "Score not available"

    return {
      content: [{
        type: "text",
        text: [
          `✅ Episode ${episodeNumber} created (ID: ${episodeId})`,
          ``,
          `Quality Score: ${scoreStr}`,
          ``,
          `Cliffhanger: ${ep?.cliffhanger || "(pending)"}`,
          ``,
          `Summary: ${ep?.summary || "(pending)"}`,
          ``,
          `Pipeline log:`,
          ...(stageLog.map((m) => `  • ${m}`)),
          ``,
          `View at: ${BASE_URL}/admin/series/${seriesId}`,
        ].join("\n"),
      }],
    }
  }
)

// ── Tool: publish_episode ─────────────────────────────────────────────────────
server.tool(
  "publish_episode",
  "Submit a pre-written screenplay (6 scenes you wrote yourself) and run the image generation + finalization pipeline — no LLM API credits needed. Call get_series first to know the series languages, characters, and last cliffhanger. Each scene must be a JSON object with: scene (1-6), type (HOOK|SETUP|CLUE|BREAKING_POINT|CONFRONTATION|CLIFFHANGER), text_en (narration), visual_description (what to see in the image), characters (array of names), duration_sec (3-15, total 60-90s), tempo (fast|normal|slow), zoom_direction (in|out), transition ('black_fade'). Takes 3-5 minutes for image generation.",
  {
    seriesId:      z.number().describe("The series ID"),
    episodeNumber: z.number().describe("The episode number to create"),
    scenes:        z.string().describe("JSON string — array of exactly 6 scene objects"),
    provider:      z.enum(["gemini", "qwen", "openai", "leonardo", "leonardo-nano", "leonardo-gpt2"]).default("qwen").describe("Image generation provider (default: qwen)"),
  },
  async ({ seriesId, episodeNumber, scenes, provider }) => {
    const parsedScenes = JSON.parse(scenes)
    if (!Array.isArray(parsedScenes) || parsedScenes.length !== 6) {
      throw new Error(`scenes must be a JSON array of exactly 6 objects, got ${parsedScenes?.length}`)
    }

    const [series, characters] = await Promise.all([
      api(`/api/admin/series/${seriesId}`),
      api(`/api/admin/characters?seriesId=${seriesId}`),
    ])

    process.stderr.write(`[scenarix] Publishing episode ${episodeNumber} for "${series.title}" (pre-written screenplay)...\n`)

    const { episodeId, score, stageLog } = await runAutoPilot({
      series,
      characters,
      episodeNumber,
      direction: null,
      provider,
      prewrittenScreenplay: parsedScenes,
    })

    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const ep = (Array.isArray(episodes) ? episodes : []).find((e) => e.episodeNumber === episodeNumber)

    const scoreStr = score
      ? `Overall: ${score.overall}/10 (tension:${score.scores?.tension} voice:${score.scores?.voice} cliff:${score.scores?.cliffhanger} continuity:${score.scores?.continuity} tone:${score.scores?.tone})`
      : "Score not available"

    return {
      content: [{
        type: "text",
        text: [
          `✅ Episode ${episodeNumber} published (ID: ${episodeId})`,
          ``,
          `Quality Score: ${scoreStr}`,
          ``,
          `Cliffhanger: ${ep?.cliffhanger || "(pending)"}`,
          ``,
          `Summary: ${ep?.summary || "(pending)"}`,
          ``,
          `Pipeline log:`,
          ...(stageLog.map((m) => `  • ${m}`)),
          ``,
          `View at: ${BASE_URL}/admin/series/${seriesId}`,
        ].join("\n"),
      }],
    }
  }
)

// ── Tool: translate_series ────────────────────────────────────────────────────
server.tool(
  "translate_series",
  "Translate all episodes of a series into one or more target languages. Calls the translate-episode API for every episode sequentially and updates the series languages list. Takes several minutes for large series.",
  {
    seriesId:       z.number().describe("The series ID"),
    targetLanguages: z.array(z.string()).describe("Target language codes, e.g. ['tr', 'es', 'de']"),
    sourceLang:     z.string().optional().default("en").describe("Source language code (default: 'en')"),
    startFromEpisode: z.number().optional().default(1).describe("Resume from this episode number (default: 1)"),
  },
  async ({ seriesId, targetLanguages, sourceLang = "en", startFromEpisode = 1 }) => {
    // 1. Fetch all episodes
    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const todo = (Array.isArray(episodes) ? episodes : [])
      .filter((ep) => ep.episodeNumber >= startFromEpisode)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)

    if (!todo.length) {
      return { content: [{ type: "text", text: "No episodes found to translate." }] }
    }

    // 2. Update series languages list
    const series = await api(`/api/admin/series/${seriesId}`)
    const currentLangs = series.languages || ["en"]
    const mergedLangs  = [...new Set([...currentLangs, sourceLang, ...targetLanguages])]
    await api(`/api/admin/series/${seriesId}`, {
      method: "PUT",
      body: JSON.stringify({ languages: mergedLangs }),
    })

    // 3. Translate each episode
    const results = []
    let ok = 0, failed = 0
    for (const ep of todo) {
      try {
        await api("/api/admin/translate-episode", {
          method: "POST",
          body: JSON.stringify({
            episodeId:   ep.id,
            sourceLang,
            targetLangs: targetLanguages,
          }),
        })
        ok++
        results.push(`  Ep ${ep.episodeNumber} ✅`)
        process.stderr.write(`[scenarix] Translated ep ${ep.episodeNumber}/${todo.length}\n`)
      } catch (err) {
        failed++
        results.push(`  Ep ${ep.episodeNumber} ❌ ${err.message}`)
      }
    }

    return {
      content: [{
        type: "text",
        text: [
          `Translation complete for series ${seriesId}`,
          `Target languages: ${targetLanguages.join(", ")}`,
          `Episodes: ${ok} OK, ${failed} failed`,
          `Series languages now: ${mergedLangs.join(", ")}`,
          ``,
          ...results,
        ].join("\n"),
      }],
    }
  }
)

// ── Tool: pin_thread ──────────────────────────────────────────────────────────
server.tool(
  "pin_thread",
  "Pin a plot thread as high priority so it is forced into the next episode's screenplay prompt under 'MUST RESOLVE IN THIS EPISODE'.",
  {
    seriesId:    z.number().describe("The series ID"),
    threadIndex: z.number().describe("Zero-based index of the thread in ongoingPlotThreads"),
  },
  async ({ seriesId, threadIndex }) => {
    const result = await api(`/api/admin/series/${seriesId}/threads`, {
      method: "PATCH",
      body: JSON.stringify({ action: "pin", threadIndex }),
    })
    return { content: [{ type: "text", text: `Thread pinned.\nPinned threads: ${JSON.stringify(result.pinnedThreads || [])}` }] }
  }
)

// ── Tool: resolve_thread ──────────────────────────────────────────────────────
server.tool(
  "resolve_thread",
  "Mark a plot thread as resolved so it is removed from the active thread list.",
  {
    seriesId:    z.number().describe("The series ID"),
    threadIndex: z.number().describe("Zero-based index of the thread in ongoingPlotThreads"),
  },
  async ({ seriesId, threadIndex }) => {
    const result = await api(`/api/admin/series/${seriesId}/threads`, {
      method: "PATCH",
      body: JSON.stringify({ action: "resolve", threadIndex }),
    })
    return { content: [{ type: "text", text: `Thread resolved.\nRemaining threads: ${JSON.stringify(result.ongoingPlotThreads || [])}` }] }
  }
)

// ── Tool: rewrite_series_narration ────────────────────────────────────────────
server.tool(
  "rewrite_series_narration",
  "Rewrite the text_en narration for all episodes of a series using improved anti-robotic writing-craft guidelines. Only text_en is changed — all other scene fields (visuals, characters, timing) are preserved. Call translate_series afterward to refresh the other-language translations.",
  {
    seriesId:         z.number().describe("The series ID"),
    startFromEpisode: z.number().optional().default(1).describe("Resume from this episode number (default: 1)"),
  },
  async ({ seriesId, startFromEpisode = 1 }) => {
    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const todo = (Array.isArray(episodes) ? episodes : [])
      .filter((ep) => ep.episodeNumber >= startFromEpisode)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)

    if (!todo.length) {
      return { content: [{ type: "text", text: "No episodes found to rewrite." }] }
    }

    const results = []
    let ok = 0, failed = 0
    for (const ep of todo) {
      try {
        await api(`/api/admin/episodes/${ep.id}/rewrite-narration`, { method: "POST" })
        ok++
        results.push(`  Ep ${ep.episodeNumber} ✅`)
        process.stderr.write(`[scenarix] Rewrote narration ep ${ep.episodeNumber}/${todo.length}\n`)
      } catch (err) {
        failed++
        results.push(`  Ep ${ep.episodeNumber} ❌ ${err.message}`)
        process.stderr.write(`[scenarix] Failed ep ${ep.episodeNumber}: ${err.message}\n`)
      }
    }

    return {
      content: [{
        type: "text",
        text: [
          `Narration rewrite complete for series ${seriesId}`,
          `Episodes: ${ok} OK, ${failed} failed`,
          ``,
          ...results,
          ``,
          `Next step: run translate_series to refresh tr/de/es/ar translations.`,
        ].join("\n"),
      }],
    }
  }
)

// ── Tool: regenerate_series_dubs ──────────────────────────────────────────────
server.tool(
  "regenerate_series_dubs",
  "Regenerate narrator voiceover audio for all episodes of a series for one or more languages (default: free neural edge-tts). Run this after rewrite_series_narration + translate_series to refresh all dubs.",
  {
    seriesId:         z.number().describe("The series ID"),
    languages:        z.array(z.string()).optional().default(["en","tr","de","es","ar"]).describe("Language codes to regenerate (default: all 5)"),
    startFromEpisode: z.number().optional().default(1).describe("Resume from this episode number (default: 1)"),
  },
  async ({ seriesId, languages = ["en","tr","de","es","ar"], startFromEpisode = 1 }) => {
    const episodes = await api(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
    const todo = (Array.isArray(episodes) ? episodes : [])
      .filter((ep) => ep.episodeNumber >= startFromEpisode)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)

    if (!todo.length) {
      return { content: [{ type: "text", text: "No episodes found to regenerate dubs for." }] }
    }

    const results = []
    let ok = 0, failed = 0
    for (const ep of todo) {
      const epResults = []
      for (const lang of languages) {
        try {
          await api(`/api/admin/episodes/${ep.id}/generate-dub`, {
            method: "POST",
            body: JSON.stringify({ lang }),
          })
          ok++
          epResults.push(`${lang}✅`)
        } catch (err) {
          failed++
          epResults.push(`${lang}❌`)
          process.stderr.write(`[scenarix] Dub failed ep ${ep.episodeNumber} ${lang}: ${err.message}\n`)
        }
      }
      results.push(`  Ep ${ep.episodeNumber}: ${epResults.join(" ")}`)
      process.stderr.write(`[scenarix] Dubs done ep ${ep.episodeNumber}/${todo.length}\n`)
    }

    return {
      content: [{
        type: "text",
        text: [
          `Dub regeneration complete for series ${seriesId}`,
          `Languages: ${languages.join(", ")}`,
          `Total dubs: ${ok} OK, ${failed} failed`,
          ``,
          ...results,
        ].join("\n"),
      }],
    }
  }
)

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write(`[scenarix-mcp] Server started — 13 tools ready (create_series, create_character, translate_series, rewrite_series_narration, regenerate_series_dubs, list_series, get_series, list_episodes, get_episode, suggest_direction, create_episode, publish_episode, pin_thread, resolve_thread)\n`)
