#!/usr/bin/env node
/**
 * Generate Episode 1 motion clips via production Fal queue, persist to renders/clips.
 * Resume-safe. Hard cap $9. No aesthetic retries.
 */
import { mkdir, writeFile, readFile, stat } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { KLING_O1_USD_PER_SECOND, MOTION_V1_HARD_CAP_USD, klingCostUsd } from "../lib/providers/video/kling.js"

const BASE = process.env.KINEVA_BASE || "https://kineva-preview.vercel.app"
const EPISODE_ID = Number(process.env.EPISODE_ID || 2)
const WORK = process.env.MOTION_WORK || "/tmp/ep1-motion"
const TOKEN_FILE = process.env.KINEVA_TASK_TOKEN_FILE || "/cursor/stores/self/kineva-task-token"
const POLL_MS = Number(process.env.KLING_POLL_MS || 5000)
const TIMEOUT_MS = Number(process.env.KLING_TIMEOUT_MS || 8 * 60 * 1000)

function token() {
  if (process.env.KINEVA_TASK_TOKEN) return process.env.KINEVA_TASK_TOKEN
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, "utf8").trim()
  throw new Error("KINEVA_TASK_TOKEN missing")
}

async function api(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      "x-kineva-task-token": token(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) {
    const err = new Error(`${method} ${pathname} ${res.status}: ${json?.error || text.slice(0, 300)}`)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

function ffprobe(file) {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v", "error", "-print_format", "json", "-show_streams", "-show_format", file,
    ], { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    child.stdout.on("data", (c) => { out += c })
    child.on("close", () => {
      try { resolve(JSON.parse(out)) } catch { resolve(null) }
    })
  })
}

function isUsableMp4(info) {
  if (!info?.format) return false
  const dur = Number(info.format.duration || 0)
  const video = (info.streams || []).find((s) => s.codec_type === "video")
  return Boolean(video) && dur >= 2
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(dest, buf)
  return buf.length
}

async function persistClip(shotId, filePath) {
  const signed = await api(`/api/admin/episodes/${EPISODE_ID}/render`, {
    method: "POST",
    body: { signedUpload: true, kind: "clip", shotId },
  })
  const buf = await readFile(filePath)
  const put = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: buf,
  })
  if (!put.ok) throw new Error(`clip upload ${put.status} ${await put.text()}`)
  return signed.path
}

async function poll(requestId) {
  const started = Date.now()
  while (Date.now() - started < TIMEOUT_MS) {
    const status = await api(`/api/admin/episodes/${EPISODE_ID}/generate-video?requestId=${encodeURIComponent(requestId)}`)
    console.log("STATUS", requestId, status.status)
    if (status.status === "COMPLETED" && status.videoUrl) return status
    if (["FAILED", "CANCELLED", "ERROR"].includes(status.status)) {
      throw new Error(`Fal job ${status.status}`)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error("Fal poll timeout")
}

await mkdir(path.join(WORK, "clips"), { recursive: true })
const plan = await api(`/api/admin/episodes/${EPISODE_ID}/generate-video`, {
  method: "POST",
  body: { dryRun: true },
})
console.log("PLAN", JSON.stringify({
  shotCount: plan.shotCount,
  totalDurationSec: plan.totalDurationSec,
  projectedUsd: plan.projectedUsd,
  capUsd: plan.capUsd,
  model: plan.model,
  withinCap: plan.withinCap,
}, null, 2))
await writeFile(path.join(WORK, "plan.json"), JSON.stringify(plan, null, 2))

if (!plan.withinCap || plan.projectedUsd > MOTION_V1_HARD_CAP_USD) {
  console.error("COST_CAP_EXCEEDED", plan.projectedUsd)
  process.exit(3)
}

let spentUsd = 0
const results = []
for (const shot of plan.shots) {
  const local = path.join(WORK, "clips", `${shot.shotId}.mp4`)
  const row = { shotId: shot.shotId, sceneIndex: shot.sceneIndex, duration: shot.duration, local }
  if (existsSync(local)) {
    const info = await ffprobe(local)
    if (isUsableMp4(info)) {
      console.log("RESUME", shot.shotId, Number(info.format.duration).toFixed(2))
      row.resumed = true
      row.bytes = (await stat(local)).size
      row.probedSec = Number(info.format.duration)
      try { row.path = await persistClip(shot.shotId, local) } catch (err) {
        console.log("PERSIST_RESUME_WARN", shot.shotId, err.message)
      }
      results.push(row)
      continue
    }
  }

  const nextCost = spentUsd + klingCostUsd(shot.duration, KLING_O1_USD_PER_SECOND)
  if (nextCost > MOTION_V1_HARD_CAP_USD) {
    console.error("STOP_BEFORE_SHOT", shot.shotId, "would spend", nextCost)
    break
  }

  let submitted
  try {
    submitted = await api(`/api/admin/episodes/${EPISODE_ID}/generate-video`, {
      method: "POST",
      body: { action: "submit", shotId: shot.shotId },
    })
  } catch (err) {
    if (err.status === 402 || /FAL_TOP_UP|BLOCKED_BALANCE/.test(String(err.message))) {
      console.error("FAL_TOP_UP_REQUIRED")
      process.exit(4)
    }
    throw err
  }
  spentUsd = nextCost
  console.log("SUBMIT", shot.shotId, submitted.requestId, "spent", spentUsd.toFixed(3))
  row.requestId = submitted.requestId

  let completed
  try {
    completed = await poll(submitted.requestId)
  } catch (err) {
    console.error("TECHNICAL_FAIL", shot.shotId, err.message)
    // one technical retry only
    submitted = await api(`/api/admin/episodes/${EPISODE_ID}/generate-video`, {
      method: "POST",
      body: { action: "submit", shotId: shot.shotId },
    })
    spentUsd += klingCostUsd(shot.duration, KLING_O1_USD_PER_SECOND)
    if (spentUsd > MOTION_V1_HARD_CAP_USD) {
      console.error("RETRY_WOULD_EXCEED_CAP", spentUsd)
      process.exit(3)
    }
    completed = await poll(submitted.requestId)
  }

  const bytes = await download(completed.videoUrl, local)
  const info = await ffprobe(local)
  if (!isUsableMp4(info)) throw new Error(`${shot.shotId} not a usable mp4`)
  row.bytes = bytes
  row.probedSec = Number(info.format.duration)
  row.path = await persistClip(shot.shotId, local)
  row.falUrl = completed.videoUrl
  console.log("PERSISTED", shot.shotId, row.path, row.probedSec)
  results.push(row)
}

const summary = {
  spentUsd,
  clips: results.length,
  totalAiSeconds: results.reduce((s, r) => s + (r.probedSec || r.duration || 0), 0),
  results,
}
await writeFile(path.join(WORK, "clips.json"), JSON.stringify(summary, null, 2))
console.log("CLIPS_DONE", JSON.stringify({ spentUsd, clips: results.length, totalAiSeconds: summary.totalAiSeconds }))
if (results.length < 8) process.exit(5)
