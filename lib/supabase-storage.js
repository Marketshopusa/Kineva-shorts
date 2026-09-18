import { createClient } from "@supabase/supabase-js"

let _supabase = null

function getClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return _supabase
}

// ── Buckets ──────────────────────────────────────────────────
export const IMAGES_BUCKET = "images"
export const AUDIO_BUCKET = "audio"
export const LOGOS_BUCKET = "logos"

// ── Path helpers ─────────────────────────────────────────────
export function imagePath(episodeId, sceneIndex, version = null) {
  return version
    ? `episodes/${episodeId}/${sceneIndex}_${version}.png`
    : `episodes/${episodeId}/${sceneIndex}.png`
}

export function audioPath(filename) {
  return filename
}

export function dubPath(episodeId, lang, sceneIndex) {
  return `dubs/${episodeId}/${lang}/${sceneIndex}.mp3`
}

export function logoPath(ext) {
  return `logo.${ext}`
}

// ── Public URL ───────────────────────────────────────────────
export function getPublicUrl(bucket, path) {
  const { data } = getClient().storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// ── Upload ───────────────────────────────────────────────────
export async function uploadBuffer(bucket, storagePath, buffer, contentType) {
  const { error } = await getClient()
    .storage.from(bucket)
    .upload(storagePath, buffer, { contentType, upsert: true })
  if (error) throw error
}

// ── Download ─────────────────────────────────────────────────
export async function downloadAsBuffer(bucket, storagePath) {
  const { data, error } = await getClient().storage.from(bucket).download(storagePath)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

// ── Delete ───────────────────────────────────────────────────
export async function deletePaths(bucket, paths) {
  if (!paths.length) return
  const { error } = await getClient().storage.from(bucket).remove(paths)
  if (error) console.error(`Storage delete error (${bucket}):`, error.message)
}
