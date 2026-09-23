#!/usr/bin/env node
/**
 * GPU-side MiniMax H3 worker. Runs next to ComfyUI, never on Vercel.
 *
 * Required:
 *   COMFYUI_URL=http://127.0.0.1:8188
 *   VIDEO_WORKFLOW_JSON=/absolute/path/to/exported-api.json
 *   VIDEO_WORKER_TOKEN=...
 *
 * Optional listen:
 *   VIDEO_WORKER_PORT=8787
 *
 * Does not invent a MiniMax graph. The exported ComfyUI API JSON is required.
 */
import { createServer } from "node:http"
import { existsSync } from "node:fs"
import { applyWorkflowInputs, loadWorkflowJson, toComfyApiPrompt } from "../lib/providers/video/minimax-h3.js"

const PORT = Number(process.env.VIDEO_WORKER_PORT || 8787)
const TOKEN = String(process.env.VIDEO_WORKER_TOKEN || "")
const COMFY = String(process.env.COMFYUI_URL || "").replace(/\/$/, "")
const jobs = new Map()

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

function unauthorized(req) {
  const header = String(req.headers.authorization || "")
  return !TOKEN || header !== `Bearer ${TOKEN}`
}

function audit() {
  const loaded = loadWorkflowJson(process.env.VIDEO_WORKFLOW_JSON || "workflows/minimax-h3/workflow.json")
  return {
    engine: "ComfyUI",
    comfyUrl: COMFY || null,
    workflowImported: loaded.imported,
    workflowPath: loaded.path,
    reason: loaded.reason || null,
    apiFormat: loaded.imported ? Boolean(toComfyApiPrompt(loaded.raw)) : false,
  }
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
}

async function queueComfy(job, body) {
  const loaded = loadWorkflowJson(process.env.VIDEO_WORKFLOW_JSON || "workflows/minimax-h3/workflow.json")
  const prompt = toComfyApiPrompt(loaded.raw)
  if (!prompt) {
    return {
      ...job,
      status: "FAILED",
      error: "WORKFLOW_JSON_MISSING: export ComfyUI API format (not the UI graph)",
    }
  }
  const mapped = applyWorkflowInputs(prompt, {
    prompt: body.prompt,
    width: body.width,
    height: body.height,
    duration: body.duration,
    seed: body.seed,
    firstFrameName: body.firstFrameName || undefined,
    lastFrameName: body.lastFrameName || undefined,
  })
  const started = Date.now()
  const res = await fetch(`${COMFY}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: mapped, client_id: "kineva" }),
  })
  const text = await res.text()
  let payload = null
  try { payload = JSON.parse(text) } catch { payload = null }
  if (!res.ok || !payload?.prompt_id) {
    return {
      ...job,
      status: "FAILED",
      error: `ComfyUI /prompt failed HTTP ${res.status}`,
      metrics: { ...job.metrics, queue_seconds: (Date.now() - started) / 1000 },
    }
  }
  return {
    ...job,
    status: "RUNNING",
    workerJobId: payload.prompt_id,
    comfyPromptId: payload.prompt_id,
    metrics: { ...job.metrics, queue_seconds: (Date.now() - started) / 1000 },
  }
}

async function pollComfy(job) {
  const id = job.comfyPromptId || job.workerJobId
  if (!id || !COMFY) return job
  const res = await fetch(`${COMFY}/history/${encodeURIComponent(id)}`)
  if (!res.ok) return job
  const history = await res.json().catch(() => ({}))
  const entry = history[id]
  if (!entry) return { ...job, status: "RUNNING" }
  const outputs = entry.outputs || {}
  let videoPath = null
  for (const node of Object.values(outputs)) {
    const videos = node?.videos || node?.gifs || node?.images || []
    const hit = videos.find((item) => /\.(mp4|webm|mkv)$/i.test(item?.filename || ""))
    if (hit) {
      videoPath = `${COMFY}/view?filename=${encodeURIComponent(hit.filename)}&type=${encodeURIComponent(hit.type || "output")}`
      break
    }
  }
  if (videoPath) {
    return { ...job, status: "COMPLETED", videoPath, error: null }
  }
  if (entry.status?.status_str === "error" || entry.status?.completed === false) {
    return { ...job, status: "FAILED", error: "ComfyUI prompt failed" }
  }
  return { ...job, status: "RUNNING" }
}

const server = createServer(async (req, res) => {
  if (unauthorized(req)) return json(res, 401, { error: "Unauthorized" })
  const url = new URL(req.url, "http://worker.local")
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return json(res, 200, { ok: Boolean(COMFY), ...audit() })
  }
  if (req.method === "POST" && url.pathname === "/v1/jobs") {
    const snapshot = audit()
    if (!snapshot.workflowImported) {
      return json(res, 409, { error: "WORKFLOW_JSON_MISSING", code: "WORKFLOW_JSON_MISSING", ...snapshot })
    }
    if (!snapshot.apiFormat) {
      return json(res, 409, { error: "WORKFLOW_JSON_MISSING", code: "WORKFLOW_JSON_MISSING", detail: "export ComfyUI API format", ...snapshot })
    }
    if (!COMFY) {
      return json(res, 503, { error: "COMFYUI_URL absent", code: "VIDEO_WORKER_MISSING" })
    }
    const body = await readBody(req)
    let job = {
      jobId: body.jobId,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
      error: null,
      metrics: {
        gpu_seconds: null,
        generation_seconds: null,
        queue_seconds: null,
        clip_duration: body.duration || 8,
        resolution: { width: body.width, height: body.height },
        model: "minimax_h3",
        retry_count: 0,
        gpu_hour_rate: Number(process.env.VIDEO_GPU_HOUR_RATE || 0) || null,
      },
    }
    job = await queueComfy(job, body)
    jobs.set(job.jobId, job)
    return json(res, job.status === "FAILED" ? 502 : 202, job)
  }
  const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/)
  if (req.method === "GET" && jobMatch) {
    const id = decodeURIComponent(jobMatch[1])
    let job = jobs.get(id)
    if (!job) return json(res, 404, { error: "not found" })
    if (job.status === "QUEUED" || job.status === "RUNNING") {
      job = await pollComfy(job)
      jobs.set(id, job)
    }
    return json(res, 200, job)
  }
  json(res, 404, { error: "not found" })
})

if (process.argv[1] && process.argv[1].includes("video-worker")) {
  if (!existsSync(process.env.VIDEO_WORKFLOW_JSON || "workflows/minimax-h3/workflow.json")) {
    console.error("WORKFLOW_JSON_MISSING: export the real MiniMax H3 ComfyUI API workflow to workflows/minimax-h3/workflow.json")
  }
  server.listen(PORT, () => {
    console.log("kineva-minimax-worker", PORT, JSON.stringify(audit()))
  })
}
