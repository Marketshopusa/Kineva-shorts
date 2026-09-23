import {
  FAL_KONTEXT_MODEL,
  FAL_KONTEXT_MULTI_MODEL,
  buildFalStillRequest,
  normalizeStillInput,
} from "./providers/images/still-request.js"
import {
  isPrivateStoragePath,
  isProviderFetchableUrl,
  resolveCharacterReferenceForProvider,
  resolveStoragePathForProvider,
} from "./character-reference-provider.js"
import { assertImagesBucketReady } from "./storage-preflight.js"
import {
  CANONICAL_REFERENCE_UNRESOLVED,
  IDENTITY_STILL_MODEL_MISMATCH,
  IDENTITY_STILL_REQUIRES_FAL,
  IMAGES_BUCKET_NOT_READY,
  planSceneStill,
  sceneStillPreflightError,
} from "./still-plan.js"
import { isVisualIdentityLocked, resolveOnScreenCharacters, scenePresencePrepared } from "./character-identity.js"

export function falModelIdFromUrl(url) {
  return String(url || "").replace(/^https:\/\/fal\.run\//, "")
}

export function expectedFalUrlForProviderRoute(providerRoute, env = process.env) {
  if (providerRoute === "MULTI_REFERENCE") return env.FAL_KONTEXT_MULTI_MODEL_URL || FAL_KONTEXT_MULTI_MODEL
  if (providerRoute === "SINGLE_REFERENCE") return env.FAL_KONTEXT_MODEL_URL || FAL_KONTEXT_MODEL
  return null
}

/**
 * Identity stills must spend on Fal kontext, never Gemini/text-only.
 * Call after references are signed. Never calls Fal.
 */
export function assertIdentityStillSpendGate({ rail, plan, resolvedInput, env = process.env } = {}) {
  const route = plan?.providerRoute
  if (route !== "SINGLE_REFERENCE" && route !== "MULTI_REFERENCE") {
    return { required: false, model: null, falUrl: null, route: null }
  }
  if (rail?.imageProvider !== "fal") {
    const err = new Error(`${IDENTITY_STILL_REQUIRES_FAL}:${rail?.imageProvider || "none"}`)
    err.code = IDENTITY_STILL_REQUIRES_FAL
    throw err
  }
  const fal = buildFalStillRequest(resolvedInput, env)
  const expected = expectedFalUrlForProviderRoute(route, env)
  if (!expected || fal.url !== expected) {
    const err = new Error(`${IDENTITY_STILL_MODEL_MISMATCH}:${fal.url}`)
    err.code = IDENTITY_STILL_MODEL_MISMATCH
    throw err
  }
  return {
    required: true,
    model: falModelIdFromUrl(fal.url),
    falUrl: fal.url,
    route: fal.route,
    aspectRatio: fal.aspectRatio || "9:16",
  }
}

function unresolvedReference(detail) {
  const err = new Error(`${CANONICAL_REFERENCE_UNRESOLVED}:${detail}`)
  err.code = CANONICAL_REFERENCE_UNRESOLVED
  return err
}

function bucketNotReady(detail) {
  const err = new Error(`${IMAGES_BUCKET_NOT_READY}:${detail}`)
  err.code = IMAGES_BUCKET_NOT_READY
  return err
}

/**
 * Sign every still reference for a provider. Private storage paths never stay
 * on image_url. Signed URLs are returned, never written to Character.
 */
export async function resolveStillInputForProvider(promptOrOpts, {
  resolvePath = resolveStoragePathForProvider,
} = {}) {
  const request = normalizeStillInput(promptOrOpts)
  const urls = []
  for (const value of request.referenceImageUrls) {
    if (isProviderFetchableUrl(value)) {
      urls.push(value)
      continue
    }
    if (!isPrivateStoragePath(value)) {
      throw unresolvedReference(value)
    }
    let resolved
    try {
      resolved = await resolvePath(value)
    } catch (err) {
      if (err?.code === "REFERENCE_AWARE_FAILED") throw err
      throw unresolvedReference(value)
    }
    if (!resolved?.providerUrl || !isProviderFetchableUrl(resolved.providerUrl)) {
      throw unresolvedReference(value)
    }
    urls.push(resolved.providerUrl)
  }

  const references = request.references.length
    ? request.references.map((item, index) => ({
      ...item,
      url: urls[index] || item.url || item.providerUrl || null,
      providerUrl: urls[index] || item.providerUrl || item.url || null,
    }))
    : urls.map((providerUrl, index) => ({
      index: index + 1,
      url: providerUrl,
      providerUrl,
    }))

  return {
    ...request,
    referenceImageUrl: urls[0] || null,
    referenceImageUrls: urls,
    references,
  }
}

export async function resolveOnScreenReferencesForProvider(onScreenCharacters, {
  resolveCharacter = resolveCharacterReferenceForProvider,
} = {}) {
  const resolved = []
  for (const character of onScreenCharacters || []) {
    if (!isVisualIdentityLocked(character)) continue
    let pack
    try {
      pack = await resolveCharacter(character)
    } catch (err) {
      if (err?.code === "REFERENCE_AWARE_FAILED") throw err
      throw unresolvedReference(`${character?.name || character?.id}:${character?.referenceImageUrl}`)
    }
    if (!pack?.providerUrl || !isProviderFetchableUrl(pack.providerUrl)) {
      throw unresolvedReference(`${character?.name || character?.id}:${character?.referenceImageUrl}`)
    }
    resolved.push({
      index: resolved.length + 1,
      characterId: pack.characterId,
      name: pack.name,
      storagePath: pack.storagePath,
      url: pack.providerUrl,
      providerUrl: pack.providerUrl,
    })
  }
  return resolved
}

/**
 * Mandatory gate before any paid still call:
 * identity ready, images bucket exists, canonical exists, resolved URL is
 * fetchable, destination bucket exists. Never calls Fal.
 */
export async function preflightSceneStillGeneration({
  scene,
  characters,
  assertStorageReady = assertImagesBucketReady,
  resolveCharacter = resolveCharacterReferenceForProvider,
} = {}) {
  const plan = planSceneStill(scene, characters)
  const identityError = sceneStillPreflightError(plan)
  if (identityError) throw identityError

  let storage
  try {
    storage = await assertStorageReady()
  } catch (err) {
    throw bucketNotReady(err?.message || "images bucket")
  }
  if (storage && storage.ready === false) {
    throw bucketNotReady("images bucket not ready")
  }

  const onScreen = scenePresencePrepared(scene) ? resolveOnScreenCharacters(scene, characters) : []
  const lockedOnScreen = onScreen.filter((character) => isVisualIdentityLocked(character))
  const references = await resolveOnScreenReferencesForProvider(lockedOnScreen, { resolveCharacter })
  if (references.length !== lockedOnScreen.length) {
    throw unresolvedReference("on-screen canonical count mismatch")
  }

  return {
    plan,
    storage,
    references,
    referenceImageUrls: references.map((item) => item.providerUrl),
    destinationBucket: "images",
  }
}
