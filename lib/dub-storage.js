import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  AUDIO_BUCKET,
  dubPath as supabaseDubPath,
  uploadBuffer as supabaseUpload,
  getPublicUrl as supabasePublicUrl,
  downloadAsBuffer as supabaseDownload,
} from "./supabase-storage.js"

/**
 * DUB_STORAGE=local  → disk under public/media/dubs (preview / $0)
 * DUB_STORAGE=supabase → existing Supabase buckets
 * unset → local when SUPABASE_URL is missing, else supabase
 */
export function getDubStorageMode() {
  const raw = String(process.env.DUB_STORAGE || "").toLowerCase().trim()
  if (raw === "local") return "local"
  if (raw === "supabase") return "supabase"
  return process.env.SUPABASE_URL ? "supabase" : "local"
}

export function localDubRelPath(seriesId, episodeId, lang, sceneIndex) {
  return path.posix.join(
    "media/dubs",
    String(seriesId),
    String(episodeId),
    String(lang),
    `${sceneIndex}.mp3`,
  )
}

export function localDubAbsPath(seriesId, episodeId, lang, sceneIndex) {
  return path.join(process.cwd(), "public", localDubRelPath(seriesId, episodeId, lang, sceneIndex))
}

export function localDubPublicUrl(seriesId, episodeId, lang, sceneIndex) {
  const rel = localDubRelPath(seriesId, episodeId, lang, sceneIndex)
  const base = String(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")
  return base ? `${base}/${rel}` : `/${rel}`
}

export async function putDub({ seriesId, episodeId, lang, sceneIndex, buffer, contentType }) {
  const mode = getDubStorageMode()
  if (mode === "local") {
    const abs = localDubAbsPath(seriesId, episodeId, lang, sceneIndex)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, buffer)
    return {
      mode: "local",
      path: localDubRelPath(seriesId, episodeId, lang, sceneIndex),
      url: localDubPublicUrl(seriesId, episodeId, lang, sceneIndex),
    }
  }
  const storagePath = supabaseDubPath(episodeId, lang, sceneIndex)
  await supabaseUpload(AUDIO_BUCKET, storagePath, buffer, contentType || "audio/mpeg")
  return {
    mode: "supabase",
    path: storagePath,
    url: supabasePublicUrl(AUDIO_BUCKET, storagePath),
  }
}

export async function readDubBuffer({ path: storagePath, url }) {
  const mode = getDubStorageMode()
  if (mode === "local" || (typeof storagePath === "string" && storagePath.startsWith("media/dubs/"))) {
    if (storagePath) {
      const abs = path.isAbsolute(storagePath)
        ? storagePath
        : path.join(process.cwd(), "public", storagePath)
      return readFile(abs)
    }
    if (url) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch dub ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    }
  }
  if (storagePath) return supabaseDownload(AUDIO_BUCKET, storagePath)
  if (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch dub ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  throw new Error("No dub path or url")
}
