export const ELENA_SERIES_ID = 2
export const ELENA_NAME = "Elena Varela"
export const ELENA_ROLE = "protagonist"

export function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
}

export function isElenaVarelaCharacter(character) {
  if (!character) return false
  if (Number(character.seriesId) !== ELENA_SERIES_ID) return false
  if (normalizeName(character.name) !== normalizeName(ELENA_NAME)) return false
  if (normalizeName(character.role) !== ELENA_ROLE) return false
  return true
}

export function matchElenaVarela(characters) {
  return (Array.isArray(characters) ? characters : []).find(isElenaVarelaCharacter) || null
}

export function characterCandidatePrefix(seriesId, characterId) {
  return `characters/${Number(seriesId)}/${Number(characterId)}/candidates`
}

export function characterCandidatePath(seriesId, characterId, candidateId) {
  const id = String(candidateId || "").replace(/[^a-zA-Z0-9_-]/g, "")
  if (!id) throw new Error("candidateId is required")
  return `${characterCandidatePrefix(seriesId, characterId)}/${id}.png`
}

export function isCanonicalStoragePath(storagePath) {
  return /\/canonical\.png$/i.test(String(storagePath || ""))
}

export function elenaMasterGenerateAllowed(candidates) {
  return !Array.isArray(candidates) || candidates.length === 0
}

export function characterMasterImageSrc(characterId) {
  return `/api/admin/characters/${Number(characterId)}/master/image`
}

function line(value) {
  const text = String(value || "").trim()
  return text || null
}

/**
 * Style brief only. Persisted Character appearance/wardrobe always win on conflict.
 * Do not put a black coat here — Character #2 wardrobe is the lock.
 */
export const ELENA_MASTER_VISUAL_BRIEF = [
  "Cinematic master character portrait in 9:16 vertical format, the definitive visual candidate for Elena Varela, protagonist of a dramatic vertical short series.",
  "Serious, intelligent, introspective presence. Expression: contained fear, emotional tension, and inner strength, as if carrying a secret after a disturbing phone call.",
  "Do not show a phone, a second person, episode action, or a specific set piece.",
  "Moody dramatic environment, subtle blue-night cinematic lighting, soft contrast, premium streaming-drama aesthetic.",
  "Framing: medium close-up to close-up portrait, centered composition, clean readable face, high facial detail, realistic skin texture, consistent anatomy, cinematic depth of field, polished but natural look.",
  "Avoid cartoon, anime, over-stylized fashion editorial, fantasy, sci-fi, glamor-model look, heavy makeup, distorted hands or body, duplicate face, multiple people, text overlays, logos, low-detail face, inconsistent anatomy, childlike appearance.",
].join(" ")

/**
 * Character master prompt. Persisted Character + Series identity outranks the style brief.
 * Not a scene still: no phone prop, no other people, no Mateo, no Iván.
 */
export function buildCharacterMasterPrompt(character, series) {
  const appearance = character?.appearance && typeof character.appearance === "object"
    ? character.appearance
    : {}
  const personality = character?.personality && typeof character.personality === "object"
    ? character.personality
    : {}
  const lines = [
    "ELENA VARELA — CHARACTER MASTER",
    "Single adult woman, photorealistic cinematic still, 9:16. Not CGI, not plastic. No other people, no text, no logo, no watermark.",
    "Persisted Character fields are the identity lock and override any later style request.",
  ]
  const appearanceBits = [
    line(appearance.basePrompt),
    line(appearance.wardrobeDefault) && `WARDROBE LOCK: ${appearance.wardrobeDefault}. Do not substitute a black coat, jacket, or other outfit.`,
    line(appearance.distinguishingFeatures) && `Distinguishing features (must be visible): ${appearance.distinguishingFeatures}`,
  ].filter(Boolean)
  if (appearanceBits.length) {
    lines.push("Persisted appearance:")
    lines.push(...appearanceBits)
  }
  const personalityBits = [
    Array.isArray(personality.traits) && personality.traits.length
      ? `Traits: ${personality.traits.filter(Boolean).join(", ")}`
      : null,
    line(personality.backstory),
  ].filter(Boolean)
  if (personalityBits.length) {
    lines.push("Persisted personality (tone only, not a scene):")
    lines.push(...personalityBits)
  }
  const seriesBits = [
    line(series?.title) && `Series: ${series.title}`,
    line(series?.tone) && `Tone: ${series.tone}`,
    line(series?.premise),
  ].filter(Boolean)
  if (seriesBits.length) {
    lines.push("Series context (style only):")
    lines.push(...seriesBits)
  }
  lines.push("Style brief (must not change identity, wardrobe, age, or distinguishing features):")
  lines.push(ELENA_MASTER_VISUAL_BRIEF)
  return lines.join("\n")
}

export const CHARACTER_MASTER_ASPECT = "9:16"
export const CHARACTER_MASTER_SIZE = { width: 1080, height: 1920 }
export const CHARACTER_MASTER_MODEL = "fal-ai/flux/dev"
