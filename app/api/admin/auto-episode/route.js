export const dynamic = "force-dynamic";
import { GoogleGenAI } from "@google/genai"
import { requireAdmin } from "@/lib/adminAuth"
import { getAIConfig } from "@/lib/getAIConfig"
import { callLLM } from "@/lib/llm"
import { buildScreenplaySystemPrompt, buildScreenplayUserPrompt, buildSummaryPrompt } from "@/lib/buildClaudePrompt"
import { buildSceneVisualPrompt } from "@/lib/buildSceneVisualPrompt"
import { getVisualStyle } from "@/config/visualStyles"
import { loadSeriesRail } from "@/lib/series-rail"
import { generateStill } from "@/lib/still-for-rail"
import prisma from "@/lib/prisma"
import fs from "fs/promises"
import path from "path"

const LEONARDO_V1 = "https://cloud.leonardo.ai/api/rest/v1"
const LEONARDO_V2 = "https://cloud.leonardo.ai/api/rest/v2"
const CONCURRENCY = 4
const IMAGE_SAVE_DIR = (epId) => path.join(process.cwd(), "uploads", "images", String(epId))

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveImageToDisk(episodeId, sceneIndex, dataUrl, promptText) {
  const dir = IMAGE_SAVE_DIR(episodeId)
  await fs.mkdir(dir, { recursive: true })
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "")
  const fullPath = path.join(dir, `${sceneIndex}.png`)
  await fs.writeFile(fullPath, Buffer.from(base64, "base64"))
  const filePath = path.join("uploads", "images", String(episodeId), `${sceneIndex}.png`)
  await prisma.image.upsert({
    where: { episodeId_sceneIndex: { episodeId, sceneIndex } },
    update:  { filePath, prompt: promptText || null },
    create:  { episodeId, sceneIndex, filePath, prompt: promptText || null, width: 1080, height: 1920 },
  })
}

async function generatePromptForScene(scene, series) {
  const { text } = await callLLM({
    system: `You are an expert at writing image generation prompts for cinematic vertical drama scenes.
Given a scene description, generate a detailed, specific image prompt optimized for AI image generation.
Focus on: composition, lighting, camera angle, mood, color palette, and specific visual elements.
The image will be 9:16 portrait format for mobile viewing.
DO NOT include character appearance descriptions — those will be injected separately.
Keep the prompt under 200 words. Output ONLY the prompt text, nothing else.`,
    user: `Scene type: ${scene.type}\nTheme: ${series.theme}\nVisual description: ${scene.visual_description || ""}`,
    maxTokens: 500,
    seriesId: series.id,
    series,
  })
  return text.trim()
}

async function generateImageGemini(prompt, config) {
  const ai = new GoogleGenAI({ apiKey: config.googleApiKey })
  const response = await ai.models.generateContent({
    model: config.geminiImageModel || "gemini-2.5-flash-lite",
    contents: prompt,
    config: { responseModalities: ["TEXT", "IMAGE"] },
  })
  const parts = response.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find((p) => p.inlineData)
  if (!imagePart?.inlineData) throw new Error("No image from Gemini")
  const { mimeType, data } = imagePart.inlineData
  return `data:${mimeType};base64,${data}`
}

const MAX_PROMPT = 1500
function truncatePrompt(p) {
  return p.length > MAX_PROMPT ? p.slice(0, MAX_PROMPT).replace(/\s+\S*$/, "") : p
}

async function pollLeonardo(generationId, headers) {
  const start = Date.now()
  while (Date.now() - start < 60_000) {
    await new Promise((r) => setTimeout(r, 2000))
    const poll = await fetch(`${LEONARDO_V1}/generations/${generationId}`, { headers })
    const data = await poll.json()
    const gen = data.generations_by_pk
    if (gen?.status === "COMPLETE") {
      const imgRes = await fetch(gen.generated_images[0].url)
      const buf = await imgRes.arrayBuffer()
      const mime = imgRes.headers.get("content-type") || "image/png"
      return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`
    }
    if (gen?.status === "FAILED") throw new Error("Leonardo generation failed")
  }
  throw new Error("Leonardo timed out")
}

const PHOENIX_MODEL_ID = "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3"

async function generateImageLeonardo(prompt, config, leonardoPreset = "CINEMATIC") {
  const { leonardoApiKey: apiKey, leonardoModelId: modelId } = config
  const headers = { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${apiKey}` }
  const safePrompt = truncatePrompt(prompt)

  const resolvedModel = modelId || PHOENIX_MODEL_ID
  const isPhoenix = resolvedModel === PHOENIX_MODEL_ID || resolvedModel === "6b645e3a-d64f-4341-a6d8-7a3690fbf042"

  const body = {
    prompt: safePrompt,
    modelId: resolvedModel,
    width: 576,
    height: 1024,
    num_images: 1,
    presetStyle: leonardoPreset,
    // Phoenix-specific: alchemy for quality mode, contrastRatio must be 0–1
    ...(isPhoenix ? { alchemy: true, contrastRatio: 0.5 } : {}),
  }

  const res = await fetch(`${LEONARDO_V1}/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
  const { sdGenerationJob } = await res.json()
  if (!sdGenerationJob?.generationId) throw new Error("No generationId from Leonardo")
  return pollLeonardo(sdGenerationJob.generationId, headers)
}

async function generateImageLeonardoV2(prompt, config, model) {
  const { leonardoApiKey: apiKey } = config
  const headers = { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${apiKey}` }
  const safePrompt = truncatePrompt(prompt)
  const res = await fetch(`${LEONARDO_V2}/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      parameters: {
        width: 768,
        height: 1344,
        prompt: safePrompt,
        quantity: 1,
        prompt_enhance: "OFF",
        ...(model === "gpt-image-2" ? { quality: "HIGH" } : {}),
      },
      public: false,
    }),
  })
  const data = await res.json()
  if (!data.generate?.generationId) throw new Error("No generationId from Leonardo v2")
  return pollLeonardo(data.generate.generationId, headers)
}

async function generateImageOpenAI(prompt, config) {
  const { default: OpenAI } = await import("openai")
  const client = new OpenAI({ apiKey: config.openaiApiKey })
  const result = await client.images.generate({
    model: "gpt-image-2",
    prompt,
    n: 1,
    size: "1024x1536",
  })
  const base64 = result.data[0].b64_json
  return `data:image/png;base64,${base64}`
}

async function generateImageQwen(prompt, config) {
  const res = await fetch(
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwenApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen-image-2.0",
        input: {
          messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        },
        parameters: { size: "576*1024", n: 1 },
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `Qwen API error (${res.status})`)
  const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image
  if (!imageUrl) throw new Error("No image URL in Qwen response")
  const imgRes = await fetch(imageUrl)
  const buf = await imgRes.arrayBuffer()
  const mime = imgRes.headers.get("content-type") || "image/png"
  return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`
}

// ─── SSE streaming POST ───────────────────────────────────────────────────────

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { series, characters, episodeNumber, direction, previousScreenplay, provider = "gemini", prewrittenScreenplay = null }
    = await request.json()

  if (!series || !characters) {
    return Response.json({ error: "series and characters are required" }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event, data) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // config is still needed for image provider keys (Leonardo/Gemini)
        const config = await getAIConfig()

        // ── Step 1: Generate Screenplay ──
        let scenes
        if (prewrittenScreenplay && Array.isArray(prewrittenScreenplay) && prewrittenScreenplay.length === 6) {
          // Use pre-written screenplay (Claude Code as writer — no LLM API credits needed)
          scenes = prewrittenScreenplay
          send("stage", { stage: "screenplay", message: "Using pre-written screenplay..." })
        } else {
          send("stage", { stage: "screenplay", message: "Generating screenplay..." })
          const systemPrompt = buildScreenplaySystemPrompt({ series, characters, languages: series.languages || ["en"] })
          const userPrompt   = buildScreenplayUserPrompt({ series, characters, episodeNumber, direction, previousScreenplay })
          const { text: screeniText } = await callLLM({ system: systemPrompt, user: userPrompt, maxTokens: 4096, timeout: 120_000, seriesId: series.id, series })
          const jsonMatch = screeniText.match(/\[[\s\S]*\]/)
          try { scenes = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(screeniText) }
          catch { throw new Error("Failed to parse screenplay") }
          if (!Array.isArray(scenes) || scenes.length !== 6) throw new Error(`Expected 6 scenes, got ${scenes?.length}`)
        }

        // Save episode to DB
        const episode = await prisma.episode.create({
          data: {
            seriesId: series.id,
            episodeNumber,
            title: `Episode ${episodeNumber}`,
            status: "visuals",
            direction: direction || null,
            screenplay: { scenes },
          },
        })
        const episodeId = episode.id
        send("episode_created", { episodeId })
        send("stage", { stage: "images", message: "Generating images (0/6)..." })

        // ── Step 1b: Score Screenplay (non-blocking, skipped when screenplay is pre-written) ──
        if (!prewrittenScreenplay) {
          try {
            const scoringPrompt = scenes
              .map((s, i) => `Scene ${i + 1} (${s.scene_type}): ${(s.visual_description || "").slice(0, 100)} | ${(s.text_en || "").slice(0, 150)}`)
              .join("\n")
            const { text: scoreText } = await callLLM({
              user: `Score this drama screenplay on 5 dimensions (1-10 each). Return ONLY JSON, no markdown:
{"scores":{"tension":<n>,"voice":<n>,"cliffhanger":<n>,"continuity":<n>,"tone":<n>},"feedback":{"tension":"<1 sentence>","voice":"<1 sentence>","cliffhanger":"<1 sentence>","continuity":"<1 sentence>","tone":"<1 sentence>"}}

Series tone: ${series.tone || "dramatic"}
Previous cliffhanger: ${series.lastCliffhanger || "none"}
Screenplay:
${scoringPrompt}`,
              maxTokens: 512,
              seriesId: series.id,
              series,
            })
            const scoreMatch = scoreText.match(/\{[\s\S]*\}/)
            if (scoreMatch) {
              const scoreData = JSON.parse(scoreMatch[0])
              const vals = Object.values(scoreData.scores || {})
              const overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0
              const fullScore = { ...scoreData, overall }
              await prisma.episode.update({ where: { id: episodeId }, data: { qualityScore: fullScore } }).catch(() => {})
              send("score", { score: fullScore })
            }
          } catch {
            // scoring is non-critical, swallow errors
          }
        }

        // ── Step 2: Generate Images ──
        let doneCount = 0
        const queue = scenes.map((scene, i) => ({ scene, index: i }))
        const active = new Map()
        let nextId = 0

        const { rail } = await loadSeriesRail(series.id)
        const visualStyle = getVisualStyle(series.visualStyle || "cinematic")
        void visualStyle

        async function generateOne({ scene, index }) {
          const imagePromptText = prewrittenScreenplay
            ? (scene.visual_description || "")
            : await generatePromptForScene(scene, series)
          const planned = buildSceneVisualPrompt({
            scene: { ...scene, visual_description: imagePromptText },
            characters,
            series,
            maxLength: 1500,
          })
          const { dataUrl } = await generateStill({
            rail,
            config,
            prompt: planned.prompt,
            referenceImageUrl: planned.referenceImageUrl,
            aspectRatio: "9:16",
            metadata: { episodeId, sceneIndex: index, characterIds: planned.characterIds },
          })
          await saveImageToDisk(episodeId, index, dataUrl, planned.prompt)
          doneCount++
          send("image_done", { index, total: 6, done: doneCount })
          send("stage", { stage: "images", message: `Generating images (${doneCount}/6)...` })
        }

        while (queue.length > 0 || active.size > 0) {
          while (active.size < CONCURRENCY && queue.length > 0) {
            const item = queue.shift()
            const id = nextId++
            const p = generateOne(item).then(() => id).catch((err) => {
              send("image_error", { index: item.index, error: err.message })
              return id
            })
            active.set(id, p)
          }
          if (active.size > 0) {
            const doneId = await Promise.race(active.values())
            active.delete(doneId)
          }
        }

        // ── Step 3: Summarize ──
        send("stage", { stage: "summarize", message: "Summarizing episode..." })
        await prisma.episode.update({ where: { id: episodeId }, data: { status: "export" } })

        let summaryData
        if (prewrittenScreenplay) {
          // Derive summary directly from scenes — no LLM needed
          const allText = scenes.map((s) => s.text_en || "").filter(Boolean).join(" ")
          const cliffhanger = (scenes[5]?.text_en || scenes[scenes.length - 1]?.text_en || "").trim()
          const allChars = [...new Set(scenes.flatMap((s) => s.characters || []))]
          summaryData = {
            summary: allText.slice(0, 400),
            cliffhanger,
            plotThreadsIntroduced: [],
            plotThreadsResolved: [],
            characterArcs: Object.fromEntries(allChars.map((c) => [c, "continues"])),
          }
        } else {
          const { text: summaryText } = await callLLM({
            user: buildSummaryPrompt(scenes, series.title, episodeNumber),
            maxTokens: 2048,
            seriesId: series.id,
            series,
          })
          try {
            // Strip markdown code fences if present (```json ... ```)
            const cleaned = summaryText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
            const m = cleaned.match(/\{[\s\S]*\}/)
            summaryData = m ? JSON.parse(m[0]) : JSON.parse(cleaned)
          } catch {
            summaryData = { summary: summaryText, cliffhanger: "", plotThreadsIntroduced: [], plotThreadsResolved: [], characterArcs: {} }
          }
        }

        // ── Step 4: Finalize ──
        send("stage", { stage: "finalize", message: "Publishing episode..." })

        const origin = new URL(request.url).origin
        const finalizeHeaders = { "Content-Type": "application/json" }
        const cookieVal = request.headers.get("cookie") || ""
        const cliKeyVal = request.headers.get("x-cli-key") || ""
        if (cliKeyVal) finalizeHeaders["x-cli-key"] = cliKeyVal
        else if (cookieVal) finalizeHeaders["cookie"] = cookieVal
        const finalizeRes = await fetch(`${origin}/api/admin/finalize`, {
          method: "POST",
          headers: finalizeHeaders,
          body: JSON.stringify({ episodeId, summaryData }),
        })
        if (!finalizeRes.ok) {
          const err = await finalizeRes.json().catch(() => ({}))
          throw new Error(err.error || "Finalization failed")
        }

        send("done", { episodeId, seriesId: series.id })
      } catch (err) {
        console.error("Auto-pilot error:", err)
        send("error", { message: err.message || "Auto-pilot failed" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
