import { blockedBalance, blockedConfig } from "../../content-rails.js"
import { checkFalBalance, requireFalSpendReady } from "../images/fal.js"
import {
  assertProviderUrlNotPrivate,
  isPrivateStoragePath,
} from "../../character-reference-provider.js"

export const KLING_O1_MODEL = "fal-ai/kling-video/o1/reference-to-video"
export const KLING_O1_QUEUE_URL = `https://queue.fal.run/${KLING_O1_MODEL}`
export const KLING_O1_USD_PER_SECOND = 0.112
export const KLING_LIPSYNC_MODEL = "fal-ai/kling-video/lipsync/audio-to-video"
export const MOTION_V1_HARD_CAP_USD = 9
export const MOTION_V1_MIN_SHOTS = 8
export const MOTION_V1_MAX_SHOTS = 12
export const MOTION_V1_MIN_DURATION_SEC = 55
export const MOTION_V1_MAX_DURATION_SEC = 75
export const DEFAULT_SHOT_DURATION_SEC = 6

function falAuthHeader(key, extra = {}) {
  return { Authorization: `Key ${key}`, Accept: "application/json", ...extra }
}

export function roundUsd(value) {
  return Math.round(Number(value) * 1000) / 1000
}

export function klingCostUsd(durationSec, usdPerSecond = KLING_O1_USD_PER_SECOND) {
  return roundUsd(Number(durationSec) * usdPerSecond)
}

export function assertCostWithinCap(projectedUsd, capUsd = MOTION_V1_HARD_CAP_USD) {
  const projected = roundUsd(projectedUsd)
  if (projected > capUsd) {
    const err = new Error(`VIDEO_COST_CAP: projected $${projected} exceeds $${capUsd}`)
    err.code = "VIDEO_COST_CAP"
    throw err
  }
  return projected
}

export function buildKlingO1Body({
  prompt,
  elements = [],
  imageUrls = [],
  duration = DEFAULT_SHOT_DURATION_SEC,
  aspectRatio = "9:16",
}) {
  const body = {
    prompt: String(prompt || ""),
    duration: String(duration),
    aspect_ratio: aspectRatio,
  }
  if (elements.length) body.elements = elements
  if (imageUrls.length) body.image_urls = imageUrls
  return body
}

export function assertKlingUrlsFetchable(body) {
  for (const element of body.elements || []) {
    assertProviderUrlNotPrivate(element.frontal_image_url)
    for (const url of element.reference_image_urls || []) {
      assertProviderUrlNotPrivate(url)
    }
  }
  for (const url of body.image_urls || []) {
    assertProviderUrlNotPrivate(url)
  }
  return body
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function throwFalFailure(res, json, text) {
  const msg = String(json?.detail || json?.error || text || `HTTP ${res.status}`)
  if (/insufficient|balance|credit|top.?up|payment/i.test(msg) || res.status === 402) {
    throw blockedBalance("video", "FAL_TOP_UP_REQUIRED")
  }
  const err = new Error(`PROVIDER_ERROR (video): Fal Kling failed (${res.status}) ${msg}`.trim())
  err.code = "PROVIDER_ERROR"
  err.status = res.status
  throw err
}

export async function submitKlingO1Job(body, env = process.env, fetchFn = fetch) {
  const key = env.FAL_KEY
  if (!key) throw blockedConfig("video", "FAL_KEY absent")
  if (env.FAL_ALLOW_GENERATE !== "1") {
    throw blockedBalance("video", "Fal generate locked ($0). No Veo/Runway/Luma fallback.")
  }
  assertKlingUrlsFetchable(body)
  for (const url of [...(body.image_urls || []), ...((body.elements || []).map((el) => el.frontal_image_url))]) {
    if (isPrivateStoragePath(url)) {
      throw blockedConfig("video", `private storage path cannot be sent to Fal (${url})`)
    }
  }
  requireFalSpendReady(await checkFalBalance(env, fetchFn))

  const res = await fetchFn(KLING_O1_QUEUE_URL, {
    method: "POST",
    headers: falAuthHeader(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const json = parseJson(text)
  if (!res.ok) throwFalFailure(res, json, text)
  const requestId = json?.request_id || json?.requestId
  if (!requestId) {
    const err = new Error("PROVIDER_ERROR (video): Fal queue returned no request_id")
    err.code = "PROVIDER_ERROR"
    throw err
  }
  return { requestId, status: json?.status || "IN_QUEUE", raw: json }
}

export async function getKlingO1Status(requestId, env = process.env, fetchFn = fetch) {
  const key = env.FAL_KEY
  if (!key) throw blockedConfig("video", "FAL_KEY absent")
  const url = `${KLING_O1_QUEUE_URL}/requests/${encodeURIComponent(requestId)}/status`
  const res = await fetchFn(url, { headers: falAuthHeader(key) })
  const text = await res.text()
  const json = parseJson(text)
  if (!res.ok) throwFalFailure(res, json, text)
  return {
    requestId,
    status: json?.status || "UNKNOWN",
    raw: json,
  }
}

export async function getKlingO1Result(requestId, env = process.env, fetchFn = fetch) {
  const key = env.FAL_KEY
  if (!key) throw blockedConfig("video", "FAL_KEY absent")
  const url = `${KLING_O1_QUEUE_URL}/requests/${encodeURIComponent(requestId)}`
  const res = await fetchFn(url, { headers: falAuthHeader(key) })
  const text = await res.text()
  const json = parseJson(text)
  if (!res.ok) throwFalFailure(res, json, text)
  const videoUrl = json?.video?.url || json?.video_url
  if (!videoUrl) {
    const err = new Error("PROVIDER_ERROR (video): Fal returned no video URL")
    err.code = "PROVIDER_ERROR"
    throw err
  }
  return {
    requestId,
    videoUrl,
    contentType: json?.video?.content_type || "video/mp4",
    fileName: json?.video?.file_name || "output.mp4",
    fileSize: json?.video?.file_size || null,
    raw: json,
  }
}

export async function waitForKlingO1Result(requestId, {
  env = process.env,
  fetchFn = fetch,
  pollMs = 4000,
  timeoutMs = 8 * 60 * 1000,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const status = await getKlingO1Status(requestId, env, fetchFn)
    if (status.status === "COMPLETED") {
      return getKlingO1Result(requestId, env, fetchFn)
    }
    if (status.status === "FAILED" || status.status === "CANCELLED" || status.status === "ERROR") {
      const err = new Error(`PROVIDER_ERROR (video): Fal job ${status.status}`)
      err.code = "PROVIDER_ERROR"
      throw err
    }
    await sleepFn(pollMs)
  }
  const err = new Error("PROVIDER_ERROR (video): Fal Kling timed out")
  err.code = "PROVIDER_ERROR"
  throw err
}
