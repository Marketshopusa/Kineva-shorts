import { sniffImageContentType } from "./image-bytes.js"
import { candidateExtensionFromContentType } from "./character-master.js"
import { imagePath } from "./supabase-storage.js"

export const STILL_TARGET_WIDTH = 1080
export const STILL_TARGET_HEIGHT = 1920
export const STILL_ASPECT_RATIO = "9:16"

export function decodeStillDataUrl(dataUrl) {
  const raw = String(dataUrl || "")
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+)?;base64,(.+)$/)
  const base64 = match ? match[2] : raw.replace(/^data:image\/\w+;base64,/, "")
  return Buffer.from(base64, "base64")
}

export function stillPersistTarget(episodeId, sceneIndex, buffer, version = Date.now()) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  const sniffed = sniffImageContentType(bytes)
  const contentType = sniffed !== "application/octet-stream" ? sniffed : "image/png"
  const extension = candidateExtensionFromContentType(contentType)
  return {
    buffer: bytes,
    contentType,
    extension,
    storagePath: imagePath(episodeId, sceneIndex, version, extension),
    width: STILL_TARGET_WIDTH,
    height: STILL_TARGET_HEIGHT,
    aspectRatio: STILL_ASPECT_RATIO,
  }
}

export function stillPersistTargetFromDataUrl(episodeId, sceneIndex, dataUrl, version = Date.now()) {
  return stillPersistTarget(episodeId, sceneIndex, decodeStillDataUrl(dataUrl), version)
}
