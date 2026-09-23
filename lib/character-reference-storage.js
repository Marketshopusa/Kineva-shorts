import {
  IMAGES_BUCKET,
  uploadBuffer,
  downloadAsBuffer,
  getSignedUrl,
  getPublicUrl,
  listPrefix,
} from "./supabase-storage.js"
import {
  candidateExtensionFromContentType,
  characterCandidatePath,
  characterCandidatePrefix,
  characterLookRefPath,
  isCanonicalStoragePath,
} from "./character-master.js"
import { sniffImageContentType } from "./image-bytes.js"

export function characterCanonicalPath(seriesId, characterId, extension = "png") {
  const ext = String(extension || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
  return `characters/${Number(seriesId)}/${Number(characterId)}/canonical.${ext}`
}

export function isDurableReferencePath(value) {
  return typeof value === "string" && value.startsWith("characters/")
}

export async function materializeReferenceBuffer(imageUrl, { fetchFn = fetch, downloadStorage = downloadAsBuffer } = {}) {
  if (!imageUrl) throw new Error("imageUrl is required")

  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) throw new Error("Invalid data URL")
    const buffer = Buffer.from(match[2], "base64")
    const sniffed = sniffImageContentType(buffer)
    const contentType = sniffed !== "application/octet-stream" ? sniffed : match[1]
    return { buffer, contentType }
  }

  if (isDurableReferencePath(imageUrl) || imageUrl.startsWith("episodes/")) {
    const buffer = await downloadStorage(IMAGES_BUCKET, imageUrl)
    const sniffed = sniffImageContentType(buffer)
    const contentType = sniffed !== "application/octet-stream" ? sniffed : "image/png"
    return { buffer, contentType }
  }

  const res = await fetchFn(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const sniffed = sniffImageContentType(buffer)
  const headerType = res.headers.get("content-type") || "image/png"
  const contentType = sniffed !== "application/octet-stream" ? sniffed : headerType
  return { buffer, contentType }
}

export async function persistCanonicalReference({
  seriesId,
  characterId,
  imageUrl,
  uploadFn = uploadBuffer,
  fetchFn = fetch,
  downloadStorage = downloadAsBuffer,
} = {}) {
  const { buffer, contentType } = await materializeReferenceBuffer(imageUrl, { fetchFn, downloadStorage })
  const sniffed = sniffImageContentType(buffer)
  const finalType = sniffed !== "application/octet-stream" ? sniffed : (contentType || "image/png")
  const extension = candidateExtensionFromContentType(finalType)
  const storagePath = characterCanonicalPath(seriesId, characterId, extension)
  await uploadFn(IMAGES_BUCKET, storagePath, buffer, finalType)
  return storagePath
}

export function assertCandidateBelongsToCharacter(seriesId, characterId, candidatePath) {
  const prefix = `${characterCandidatePrefix(seriesId, characterId)}/`
  const path = String(candidatePath || "")
  if (!path.startsWith(prefix) || !/\.(png|jpe?g|webp)$/i.test(path) || isCanonicalStoragePath(path)) {
    throw new Error("candidate path does not belong to this character")
  }
  return path
}

export async function approveCanonicalFromCandidate({
  seriesId,
  characterId,
  candidatePath,
  uploadFn = uploadBuffer,
  fetchFn = fetch,
  downloadStorage = downloadAsBuffer,
} = {}) {
  const sourcePath = assertCandidateBelongsToCharacter(seriesId, characterId, candidatePath)
  const canonicalPath = await persistCanonicalReference({
    seriesId,
    characterId,
    imageUrl: sourcePath,
    uploadFn,
    fetchFn,
    downloadStorage,
  })
  if (!isCanonicalStoragePath(canonicalPath)) {
    throw new Error("canonical persist must write a canonical.* path")
  }
  return { canonicalPath, candidatePath: sourcePath }
}

export async function persistLookReference({
  seriesId,
  characterId,
  filename,
  imageUrl,
  uploadFn = uploadBuffer,
  fetchFn = fetch,
  downloadStorage = downloadAsBuffer,
} = {}) {
  const { buffer, contentType } = await materializeReferenceBuffer(imageUrl, { fetchFn, downloadStorage })
  const storagePath = characterLookRefPath(seriesId, characterId, filename)
  if (isCanonicalStoragePath(storagePath) || /\/candidates\//.test(storagePath)) {
    throw new Error("look-ref must not write canonical or candidates")
  }
  await uploadFn(IMAGES_BUCKET, storagePath, buffer, contentType || "image/jpeg")
  return storagePath
}

export async function lookReferenceDataUrl(storagePath, { downloadStorage = downloadAsBuffer } = {}) {
  const buffer = await downloadStorage(IMAGES_BUCKET, storagePath)
  const mime = buffer[0] === 0xff && buffer[1] === 0xd8 ? "image/jpeg" : "image/png"
  return `data:${mime};base64,${buffer.toString("base64")}`
}

export async function persistCharacterCandidate({
  seriesId,
  characterId,
  imageUrl,
  candidateId,
  uploadFn = uploadBuffer,
  fetchFn = fetch,
  downloadStorage = downloadAsBuffer,
} = {}) {
  const materialized = await materializeReferenceBuffer(imageUrl, { fetchFn, downloadStorage })
  const sniffed = sniffImageContentType(materialized.buffer)
  const contentType = sniffed !== "application/octet-stream"
    ? sniffed
    : (materialized.contentType || "image/png")
  const extension = candidateExtensionFromContentType(contentType)
  const storagePath = characterCandidatePath(seriesId, characterId, candidateId, extension)
  if (isCanonicalStoragePath(storagePath)) {
    throw new Error("candidate storage must not write canonical.png")
  }
  await uploadFn(IMAGES_BUCKET, storagePath, materialized.buffer, contentType)
  return storagePath
}

export async function listCharacterCandidates(seriesId, characterId, listFn = listPrefix) {
  const prefix = characterCandidatePrefix(seriesId, characterId)
  let entries = []
  try {
    entries = await listFn(IMAGES_BUCKET, prefix)
  } catch {
    return []
  }
  return (entries || [])
    .filter((entry) => entry?.name && /\.(png|jpe?g|webp)$/i.test(entry.name) && entry.name !== ".emptyFolderPlaceholder")
    .map((entry) => ({
      name: entry.name,
      path: `${prefix}/${entry.name}`,
      updatedAt: entry.updated_at || entry.created_at || null,
    }))
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
}

export function selectLatestCharacterCandidate(candidates) {
  const list = Array.isArray(candidates) ? [...candidates] : []
  list.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
  return list[0] || null
}

export async function canonicalReferenceDisplayUrl(storagePath) {
  if (!storagePath) return null
  if (storagePath.startsWith("http") || storagePath.startsWith("data:") || storagePath.startsWith("/")) {
    return storagePath
  }
  try {
    return await getSignedUrl(IMAGES_BUCKET, storagePath, 60 * 60 * 24)
  } catch {
    return getPublicUrl(IMAGES_BUCKET, storagePath)
  }
}
