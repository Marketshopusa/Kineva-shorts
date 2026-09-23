import { IMAGES_BUCKET, downloadAsBuffer, getSignedUrl } from "./supabase-storage.js"
import { isDurableReferencePath } from "./character-reference-storage.js"

export const PROVIDER_REFERENCE_TTL_SEC = 60 * 60

export function isProviderFetchableUrl(value) {
  const url = String(value || "")
  return /^https?:\/\//i.test(url) || url.startsWith("data:image/")
}

export function isPrivateStoragePath(value) {
  const path = String(value || "")
  if (!path) return false
  if (isProviderFetchableUrl(path)) return false
  return isDurableReferencePath(path) || path.startsWith("episodes/") || path.startsWith("characters/")
}

export function privateReferenceNotFetchable(detail) {
  const err = new Error(`REFERENCE_AWARE_FAILED (image): private storage path cannot be sent to provider (${detail})`)
  err.code = "REFERENCE_AWARE_FAILED"
  return err
}

/**
 * Sign a durable private storage path for a provider. Never publicizes the bucket.
 * Returns { storagePath, providerUrl, durablePath }. Does not write Character rows.
 */
export async function resolveStoragePathForProvider(storagePath, {
  downloadStorage = downloadAsBuffer,
  signUrl = getSignedUrl,
  expiresSec = PROVIDER_REFERENCE_TTL_SEC,
} = {}) {
  if (!storagePath) return null

  if (isProviderFetchableUrl(storagePath)) {
    return {
      storagePath,
      providerUrl: storagePath,
      durablePath: isDurableReferencePath(storagePath) ? storagePath : null,
    }
  }

  if (!isDurableReferencePath(storagePath) && !storagePath.startsWith("episodes/")) {
    throw privateReferenceNotFetchable(storagePath)
  }

  await downloadStorage(IMAGES_BUCKET, storagePath)
  const providerUrl = await signUrl(IMAGES_BUCKET, storagePath, expiresSec)
  if (!isProviderFetchableUrl(providerUrl)) {
    throw privateReferenceNotFetchable(`signed URL was not fetchable for ${storagePath}`)
  }

  return {
    storagePath,
    providerUrl,
    durablePath: storagePath,
  }
}

/**
 * Turn Character.referenceImageUrl (durable private path) into a fetchable
 * provider URL. Never writes the signed URL back onto the Character row.
 */
export async function resolveCharacterReferenceForProvider(character, deps = {}) {
  const storagePath = character?.referenceImageUrl || null
  if (!storagePath) return null

  const resolved = await resolveStoragePathForProvider(storagePath, deps)
  return {
    characterId: Number(character.id),
    name: String(character.name || ""),
    storagePath: resolved.storagePath,
    providerUrl: resolved.providerUrl,
    durablePath: resolved.durablePath,
  }
}

export function assertProviderUrlNotPrivate(url) {
  if (isPrivateStoragePath(url)) {
    throw privateReferenceNotFetchable(url)
  }
  if (url && !isProviderFetchableUrl(url)) {
    throw privateReferenceNotFetchable(url)
  }
  return url
}
