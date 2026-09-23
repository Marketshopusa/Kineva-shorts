import { createClient } from "@supabase/supabase-js"
import {
  MOTION_RENDER_FILENAME,
  LEGACY_ANIMATIC_FILENAME,
  motionRenderPath,
  legacyAnimaticPath,
  clipPath,
  clipPrefix,
  isAllowedRenderObjectPath,
} from "./video-clip-storage.js"

export {
  MOTION_RENDER_FILENAME,
  LEGACY_ANIMATIC_FILENAME,
  motionRenderPath,
  legacyAnimaticPath,
  clipPath,
  clipPrefix,
  isAllowedRenderObjectPath,
}

let _supabase = null

function getServerKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
}

function getClient() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL
    const key = getServerKey()
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required")
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

// ── Buckets ──────────────────────────────────────────────────
export const IMAGES_BUCKET = "images"
export const AUDIO_BUCKET = "dubs"
export const RENDERS_BUCKET = "renders"
export const LOGOS_BUCKET = "logos"

// ── Path helpers ─────────────────────────────────────────────
export function imagePath(episodeId, sceneIndex, version = null, extension = "png") {
  const ext = String(extension || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
  return version
    ? `episodes/${episodeId}/${sceneIndex}_${version}.${ext}`
    : `episodes/${episodeId}/${sceneIndex}.${ext}`
}

export function audioPath(filename) {
  return filename
}

export function dubPath(episodeId, lang, sceneIndex) {
  return `${episodeId}/${lang}/${sceneIndex}.mp3`
}

/** Canonical upload path for the legacy animatic. Motion V1 uses motionRenderPath. */
export function renderPath(seriesId, episodeId) {
  return legacyAnimaticPath(seriesId, episodeId)
}

/**
 * Watch/read order. Motion V1 is preferred when present.
 * Pass { version: "legacy" } to isolate the Ken Burns animatic.
 */
export function renderCandidates(seriesId, episodeId, { version } = {}) {
  const motion = motionRenderPath(seriesId, episodeId)
  const episodeOne = `series/${seriesId}/episodes/${episodeId}/${LEGACY_ANIMATIC_FILENAME}`
  const demo = `series/${seriesId}/episodes/${episodeId}/kineva-demo.mp4`
  if (version === "legacy") {
    if (Number(seriesId) === 1 && Number(episodeId) === 1) return [demo, episodeOne]
    return [episodeOne, demo]
  }
  if (version === "motion") return [motion]
  if (Number(seriesId) === 1 && Number(episodeId) === 1) return [motion, demo, episodeOne]
  return [motion, episodeOne, demo]
}

export function logoPath(ext) {
  return `logo.${ext}`
}

// ── Public URL (legacy; prefer signed URLs for private buckets) ─
export function getPublicUrl(bucket, path) {
  const { data } = getClient().storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function getSignedUrl(bucket, storagePath, expiresSec = 60 * 60 * 24 * 7) {
  const { data, error } = await getClient()
    .storage.from(bucket)
    .createSignedUrl(storagePath, expiresSec)
  if (error) throw error
  return data.signedUrl
}

// ── Upload ───────────────────────────────────────────────────
export async function uploadBuffer(bucket, storagePath, buffer, contentType) {
  const { error } = await getClient()
    .storage.from(bucket)
    .upload(storagePath, buffer, { contentType, upsert: true })
  if (error) throw error
}

export async function createSignedUploadUrl(bucket, storagePath, { upsert = true } = {}) {
  const { data, error } = await getClient()
    .storage.from(bucket)
    .createSignedUploadUrl(storagePath, { upsert })
  if (error) throw error
  return data
}

// ── Download ─────────────────────────────────────────────────
export async function downloadAsBuffer(bucket, storagePath) {
  const { data, error } = await getClient().storage.from(bucket).download(storagePath)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

// ── Delete ───────────────────────────────────────────────────
export async function listPrefix(bucket, prefix) {
  const { data, error } = await getClient()
    .storage.from(bucket)
    .list(prefix, { limit: 50, sortBy: { column: "created_at", order: "desc" } })
  if (error) throw error
  return data || []
}

export async function listStorageBuckets() {
  const { data, error } = await getClient().storage.listBuckets()
  if (error) throw error
  return (data || []).map((bucket) => ({
    name: bucket.name,
    public: !!bucket.public,
  }))
}

export async function createPrivateBucket(name, { public: isPublic = false, fileSizeLimit = 20 * 1024 * 1024 } = {}) {
  const { error } = await getClient().storage.createBucket(name, {
    public: isPublic,
    fileSizeLimit,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  })
  if (error && !/already exists/i.test(error.message || "")) throw error
}

export async function deletePaths(bucket, paths) {
  if (!paths.length) return
  const { error } = await getClient().storage.from(bucket).remove(paths)
  if (error) console.error(`Storage delete error (${bucket}):`, error.message)
}
