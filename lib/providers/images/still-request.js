export const STILL_ROUTE_TEXT = "text-only"
export const STILL_ROUTE_REFERENCE = "reference-aware"

export function normalizeStillInput(promptOrOpts) {
  if (typeof promptOrOpts === "string") {
    return {
      prompt: promptOrOpts,
      referenceImageUrl: null,
      aspectRatio: "9:16",
      metadata: {},
    }
  }
  const opts = promptOrOpts && typeof promptOrOpts === "object" ? promptOrOpts : {}
  const referenceImageUrl = opts.referenceImageUrl || null
  return {
    prompt: opts.prompt || "",
    referenceImageUrl,
    aspectRatio: opts.aspectRatio || "9:16",
    metadata: opts.metadata && typeof opts.metadata === "object" ? opts.metadata : {},
  }
}

export function selectStillRoute({ referenceImageUrl } = {}) {
  return referenceImageUrl ? STILL_ROUTE_REFERENCE : STILL_ROUTE_TEXT
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

/**
 * Fal request planner. When a canonical reference exists, the IMAGE URL is placed
 * on the provider body (`image_url`). It is never rewritten into prompt text.
 */
export function buildFalStillRequest(promptOrOpts, env = process.env) {
  const request = normalizeStillInput(promptOrOpts)
  const route = selectStillRoute(request)
  const size = aspectRatioToSize(request.aspectRatio)
  const textUrl = env.FAL_TEXT_MODEL_URL || "https://fal.run/fal-ai/flux/dev"
  const referenceUrl = env.FAL_REFERENCE_MODEL_URL || "https://fal.run/fal-ai/flux/dev/image-to-image"
  const strength = Number(request.metadata?.strength)
  const refStrength = Number.isFinite(strength) ? strength : 0.35

  if (route === STILL_ROUTE_REFERENCE) {
    return {
      route,
      url: referenceUrl,
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

/**
 * Gemini contents planner. Reference is an image part, not a "must match" sentence.
 */
export function buildGeminiStillContents(promptOrOpts, referenceInlineData = null) {
  const request = normalizeStillInput(promptOrOpts)
  if (!request.referenceImageUrl && !referenceInlineData) {
    return { route: STILL_ROUTE_TEXT, contents: request.prompt, referenceImageUrl: null }
  }
  const parts = []
  if (referenceInlineData?.data) {
    parts.push({
      inlineData: {
        mimeType: referenceInlineData.mimeType || "image/png",
        data: referenceInlineData.data,
      },
    })
  } else if (request.referenceImageUrl) {
    parts.push({ fileData: { fileUri: request.referenceImageUrl } })
  }
  parts.push({ text: request.prompt })
  return {
    route: STILL_ROUTE_REFERENCE,
    contents: [{ role: "user", parts }],
    referenceImageUrl: request.referenceImageUrl,
  }
}
