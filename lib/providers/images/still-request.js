export const STILL_ROUTE_TEXT = "text-only"
export const STILL_ROUTE_SINGLE_REFERENCE = "single-reference"
export const STILL_ROUTE_MULTI_REFERENCE = "multi-reference"
/** @deprecated alias of single-reference for older tests */
export const STILL_ROUTE_REFERENCE = STILL_ROUTE_SINGLE_REFERENCE

export const FAL_TEXT_MODEL = "https://fal.run/fal-ai/flux/dev"
export const FAL_KONTEXT_MODEL = "https://fal.run/fal-ai/flux-pro/kontext"
export const FAL_KONTEXT_MULTI_MODEL = "https://fal.run/fal-ai/flux-pro/kontext/multi"
export const FAL_CHARACTER_MASTER_REFERENCE_MODEL = "https://fal.run/fal-ai/flux/dev/image-to-image"

import {
  assertProviderUrlNotPrivate,
  isPrivateStoragePath,
  privateReferenceNotFetchable,
} from "../../character-reference-provider.js"

function asUrlList(opts) {
  if (Array.isArray(opts.referenceImageUrls) && opts.referenceImageUrls.length) {
    return opts.referenceImageUrls.map((item) => String(item || "")).filter(Boolean)
  }
  if (opts.referenceImageUrl) return [String(opts.referenceImageUrl)]
  return []
}

export function normalizeStillInput(promptOrOpts) {
  if (typeof promptOrOpts === "string") {
    return {
      prompt: promptOrOpts,
      referenceImageUrl: null,
      referenceImageUrls: [],
      references: [],
      aspectRatio: "9:16",
      metadata: {},
    }
  }
  const opts = promptOrOpts && typeof promptOrOpts === "object" ? promptOrOpts : {}
  const references = Array.isArray(opts.references) ? opts.references : []
  const fromPack = references.map((item) => item?.providerUrl || item?.url).filter(Boolean)
  const referenceImageUrls = fromPack.length ? fromPack : asUrlList(opts)
  const referenceImageUrl = referenceImageUrls[0] || null
  return {
    prompt: opts.prompt || "",
    referenceImageUrl,
    referenceImageUrls,
    references,
    aspectRatio: opts.aspectRatio || "9:16",
    metadata: opts.metadata && typeof opts.metadata === "object" ? opts.metadata : {},
  }
}

export function selectStillRoute(input = {}) {
  const request = input.prompt != null || input.referenceImageUrls || input.referenceImageUrl || input.references
    ? normalizeStillInput(input)
    : normalizeStillInput({
      prompt: "",
      referenceImageUrl: input.referenceImageUrl,
      referenceImageUrls: input.referenceImageUrls,
      references: input.references,
    })
  const count = request.referenceImageUrls.length
  if (count >= 2) return STILL_ROUTE_MULTI_REFERENCE
  if (count === 1) return STILL_ROUTE_SINGLE_REFERENCE
  return STILL_ROUTE_TEXT
}

export function aspectRatioToSize(aspectRatio = "9:16") {
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 }
  if (aspectRatio === "1:1") return { width: 1024, height: 1024 }
  return { width: 1080, height: 1920 }
}

export function referenceAwareFailure(detail) {
  const err = new Error(`REFERENCE_AWARE_FAILED (image): ${detail}`)
  err.code = "REFERENCE_AWARE_FAILED"
  return err
}

export function isReferenceAwareRoute(route) {
  return route === STILL_ROUTE_SINGLE_REFERENCE || route === STILL_ROUTE_MULTI_REFERENCE
}

function isCharacterMasterRequest(metadata) {
  return metadata?.kind === "character-master" || Number.isFinite(Number(metadata?.strength))
}

/**
 * Fal request planner.
 * Episode stills with canonical identity use kontext / kontext-multi.
 * Character-master look-ref keeps flux/dev image-to-image.
 * Private storage paths never go on image_url.
 */
export function buildFalStillRequest(promptOrOpts, env = process.env) {
  const request = normalizeStillInput(promptOrOpts)
  const route = selectStillRoute(request)
  const size = aspectRatioToSize(request.aspectRatio)
  const textUrl = env.FAL_TEXT_MODEL_URL || FAL_TEXT_MODEL
  const kontextUrl = env.FAL_KONTEXT_MODEL_URL || FAL_KONTEXT_MODEL
  const kontextMultiUrl = env.FAL_KONTEXT_MULTI_MODEL_URL || FAL_KONTEXT_MULTI_MODEL
  const masterRefUrl = env.FAL_REFERENCE_MODEL_URL || FAL_CHARACTER_MASTER_REFERENCE_MODEL

  for (const url of request.referenceImageUrls) {
    if (isPrivateStoragePath(url)) throw privateReferenceNotFetchable(url)
    assertProviderUrlNotPrivate(url)
  }

  if (route === STILL_ROUTE_TEXT) {
    return {
      route,
      url: textUrl,
      body: {
        prompt: request.prompt,
        image_size: size,
        num_images: 1,
        enable_safety_checker: true,
      },
      aspectRatio: request.aspectRatio,
      metadata: request.metadata,
    }
  }

  if (isCharacterMasterRequest(request.metadata) && route === STILL_ROUTE_SINGLE_REFERENCE) {
    const strength = Number(request.metadata?.strength)
    const refStrength = Number.isFinite(strength) ? strength : 0.35
    return {
      route,
      url: masterRefUrl,
      body: {
        prompt: request.prompt,
        image_url: request.referenceImageUrl,
        image_size: size,
        num_images: 1,
        enable_safety_checker: true,
        strength: refStrength,
      },
      aspectRatio: request.aspectRatio,
      metadata: request.metadata,
    }
  }

  if (route === STILL_ROUTE_MULTI_REFERENCE) {
    return {
      route,
      url: kontextMultiUrl,
      body: {
        prompt: request.prompt,
        image_urls: request.referenceImageUrls,
        aspect_ratio: request.aspectRatio || "9:16",
        num_images: 1,
        output_format: "jpeg",
      },
      aspectRatio: request.aspectRatio,
      metadata: request.metadata,
      silentFallback: false,
    }
  }

  return {
    route,
    url: kontextUrl,
    body: {
      prompt: request.prompt,
      image_url: request.referenceImageUrl,
      aspect_ratio: request.aspectRatio || "9:16",
      num_images: 1,
      output_format: "jpeg",
    },
    aspectRatio: request.aspectRatio,
    metadata: request.metadata,
    silentFallback: false,
  }
}

/**
 * Gemini contents planner. Reference is an image part, not a "must match" sentence.
 */
export function buildGeminiStillContents(promptOrOpts, referenceInlineData = null) {
  const request = normalizeStillInput(promptOrOpts)
  const inlineList = Array.isArray(referenceInlineData) ? referenceInlineData : (referenceInlineData ? [referenceInlineData] : [])
  if (!request.referenceImageUrls.length && !inlineList.length) {
    return { route: STILL_ROUTE_TEXT, contents: request.prompt, referenceImageUrl: null, referenceImageUrls: [] }
  }
  const parts = []
  if (inlineList.length) {
    for (const item of inlineList) {
      if (!item?.data) continue
      parts.push({
        inlineData: {
          mimeType: item.mimeType || "image/png",
          data: item.data,
        },
      })
    }
  } else {
    for (const url of request.referenceImageUrls) {
      if (isPrivateStoragePath(url)) throw privateReferenceNotFetchable(url)
      parts.push({ fileData: { fileUri: url } })
    }
  }
  parts.push({ text: request.prompt })
  const route = request.referenceImageUrls.length >= 2 || inlineList.length >= 2
    ? STILL_ROUTE_MULTI_REFERENCE
    : STILL_ROUTE_SINGLE_REFERENCE
  return {
    route,
    contents: [{ role: "user", parts }],
    referenceImageUrl: request.referenceImageUrl,
    referenceImageUrls: request.referenceImageUrls,
  }
}
