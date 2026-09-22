import {
  IMAGES_BUCKET,
  uploadBuffer,
  downloadAsBuffer,
  getSignedUrl,
  getPublicUrl,
  listPrefix,
} from "./supabase-storage.js"
import {
  characterCandidatePath,
  characterCandidatePrefix,
  isCanonicalStoragePath,
} from "./character-master.js"

export function characterCanonicalPath(seriesId, characterId) {
  return `characters/${Number(seriesId)}/${Number(characterId)}/canonical.png`
}

export function isDurableReferencePath(value) {
  return typeof value === "string" && value.startsWith("characters/")
}

export async function materializeReferenceBuffer(imageUrl, { fetchFn = fetch, downloadStorage = downloadAsBuffer } = {}) {
  if (!imageUrl) throw new Error("imageUrl is required")

  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) throw new Error("Invalid data URL")
    return { buffer: Buffer.from(match[2], "base64"), contentType: match[1] }
  }

  if (isDurableReferencePath(imageUrl) || imageUrl.startsWith("episodes/")) {
    const buffer = await downloadStorage(IMAGES_BUCKET, imageUrl)
    return { buffer, contentType: "image/png" }
  }

  const res = await fetchFn(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get("content-type") || "image/png"
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
  const storagePath = characterCanonicalPath(seriesId, characterId)
  await uploadFn(IMAGES_BUCKET, storagePath, buffer, contentType || "image/png")
  return storagePath
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
  const { buffer, contentType } = await materializeReferenceBuffer(imageUrl, { fetchFn, downloadStorage })
  const storagePath = characterCandidatePath(seriesId, characterId, candidateId)
  if (isCanonicalStoragePath(storagePath)) {
    throw new Error("candidate storage must not write canonical.png")
  }
  await uploadFn(IMAGES_BUCKET, storagePath, buffer, contentType || "image/png")
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
    .filter((entry) => entry?.name && /\.png$/i.test(entry.name) && entry.name !== ".emptyFolderPlaceholder")
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
