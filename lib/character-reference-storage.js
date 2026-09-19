import {
  IMAGES_BUCKET,
  uploadBuffer,
  downloadAsBuffer,
  getSignedUrl,
  getPublicUrl,
} from "./supabase-storage.js"

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
