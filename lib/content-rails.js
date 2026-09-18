/**
 * Single source of truth for Series.contentRating → providers.
 * Minors / CSAM / non-consensual real: never allowed.
 * Public mature/explicit still needs an age-gate (NOT implemented here).
 *
 * No silent provider swaps. Assigned backend fails → explicit BLOCKED_* error.
 */

export const RATING_IDS = Object.freeze(["sfw", "mature", "explicit"])

/** Safe default only when creating a series from an empty form. Runtime resolve does not use this. */
export const DEFAULT_CREATE_RATING = "sfw"

export const CONTENT_RATINGS = [
  {
    id: "sfw",
    label: "SFW",
    blurb: "General / cable-safe. No explicit sex.",
    textProvider: "gemini",
    imageProvider: "gemini",
    videoProvider: "remotion",
    voiceProvider: "edge",
    blocked: ["leonardo", "elevenlabs", "veo", "runway", "luma"],
  },
  {
    id: "mature",
    label: "Maduro (+18)",
    blurb: "TV-MA: violence, affairs, language, implied sex. Not porn.",
    textProvider: "qwen",
    imageProvider: "fal",
    videoProvider: "remotion",
    voiceProvider: "edge",
    blocked: ["leonardo", "gemini", "elevenlabs", "veo", "runway", "luma"],
  },
  {
    id: "explicit",
    label: "Explícito (+18)",
    blurb: "Sexual content between consenting adults. Age-gate required before any public surface.",
    textProvider: "qwen",
    imageProvider: "fal",
    videoProvider: "remotion",
    voiceProvider: "edge",
    blocked: ["leonardo", "gemini", "elevenlabs", "veo", "runway", "luma", "anthropic"],
  },
]

const BY_ID = Object.fromEntries(CONTENT_RATINGS.map((r) => [r.id, Object.freeze({ ...r })]))

export function isKnownRating(value) {
  return RATING_IDS.includes(String(value || "").toLowerCase())
}

/** Persist on create/update: unknown → sfw (safe), never explicit. */
export function normalizeRating(value) {
  const id = String(value || DEFAULT_CREATE_RATING).toLowerCase()
  return isKnownRating(id) ? id : DEFAULT_CREATE_RATING
}

/**
 * Runtime resolver. Unknown ratings throw — they do not collapse into explicit/mature.
 * @param {string} rating
 */
export function resolveContentRail(rating) {
  const id = String(rating || "").toLowerCase().trim()
  if (!isKnownRating(id)) {
    const err = new Error(`UNKNOWN_RATING: ${id || "(empty)"} is not a valid content rail`)
    err.code = "UNKNOWN_RATING"
    throw err
  }
  return BY_ID[id]
}

export function railFor(rating) {
  return resolveContentRail(rating)
}

/** Compact dry-run shape: { text, image, voice, video } */
export function summarizeRail(rating) {
  const rail = resolveContentRail(rating)
  return {
    text: rail.textProvider,
    image: rail.imageProvider,
    voice: rail.voiceProvider,
    video: rail.videoProvider,
  }
}

export function providerError(kind, detail) {
  const err = new Error(`PROVIDER_ERROR (${kind}): ${detail}`)
  err.code = "PROVIDER_ERROR"
  return err
}

/**
 * Explicit SFW still override. Text rail stays Gemini.
 * Mature/explicit image rails are never changed here.
 */
export function sfwImageOverride(env = process.env) {
  const raw = String(env.SFW_IMAGE_PROVIDER || "").toLowerCase().trim()
  if (!raw || raw === "gemini") return null
  if (raw === "fal") return "fal"
  const err = new Error(`BLOCKED_CONFIG (image): SFW_IMAGE_PROVIDER=${raw} is not allowed (use gemini or fal)`)
  err.code = "BLOCKED_CONFIG"
  throw err
}

export function effectiveImageProvider(rail, env = process.env) {
  if (rail?.id === "sfw") {
    return sfwImageOverride(env) || rail.imageProvider
  }
  return rail?.imageProvider
}

export function withEffectiveImageRail(rail, env = process.env) {
  const imageProvider = effectiveImageProvider(rail, env)
  if (!rail || imageProvider === rail.imageProvider) return rail
  return { ...rail, imageProvider }
}

export function inspectRailReadiness(rail, env = process.env) {
  const blocks = []
  if (!rail) {
    return { ready: false, blocks: [{ kind: "rail", code: "UNKNOWN_RATING" }] }
  }
  const imageProvider = effectiveImageProvider(rail, env)
  if (rail.textProvider === "qwen" && !env.QWEN_API_KEY) {
    blocks.push({ kind: "text", code: "BLOCKED_CONFIG", detail: "QWEN_API_KEY absent" })
  }
  if (rail.textProvider === "gemini" && !env.GOOGLE_API_KEY) {
    blocks.push({ kind: "text", code: "BLOCKED_CONFIG", detail: "GOOGLE_API_KEY absent" })
  }
  if (imageProvider === "gemini" && !env.GOOGLE_API_KEY) {
    blocks.push({ kind: "image", code: "BLOCKED_CONFIG", detail: "GOOGLE_API_KEY absent" })
  }
  if (imageProvider === "fal" && !env.FAL_KEY) {
    blocks.push({ kind: "image", code: "BLOCKED_CONFIG", detail: "FAL_KEY absent" })
  }
  if (imageProvider === "fal" && env.FAL_KEY && env.FAL_ALLOW_GENERATE !== "1") {
    blocks.push({
      kind: "image",
      code: "BLOCKED_BALANCE",
      detail: "Fal generate locked until FAL_ALLOW_GENERATE=1 (no $0 spend)",
    })
  }
  if (rail.voiceProvider !== "edge") {
    blocks.push({ kind: "voice", code: "BLOCKED_CONFIG", detail: "voice must be edge-tts" })
  }
  if (rail.videoProvider !== "remotion") {
    blocks.push({ kind: "video", code: "BLOCKED_CONFIG", detail: "video must be remotion" })
  }
  return { rail, blocks, ready: blocks.length === 0 }
}

export function assertAdapterMatchesRail(rail, kind, adapterId) {
  const key = `${kind}Provider`
  const expected = rail[key]
  if (adapterId !== expected) {
    const err = new Error(
      `RAIL_MISMATCH: ${rail.id} ${kind} is ${expected}, refused ${adapterId} (no silent fallback)`,
    )
    err.code = "RAIL_MISMATCH"
    throw err
  }
}

export function blockedConfig(kind, detail) {
  const err = new Error(`BLOCKED_CONFIG (${kind}): ${detail}`)
  err.code = "BLOCKED_CONFIG"
  return err
}

export function blockedBalance(kind, detail) {
  const err = new Error(`BLOCKED_BALANCE (${kind}): ${detail}`)
  err.code = "BLOCKED_BALANCE"
  return err
}
