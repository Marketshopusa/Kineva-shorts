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

export const ELENA_MAX_MASTER_CANDIDATES = 2

export function elenaMasterGenerateAllowed(candidates, { regenerate = false } = {}) {
  const count = Array.isArray(candidates) ? candidates.length : 0
  if (regenerate) return count === 1
  return count === 0
}

export function characterMasterImageSrc(characterId, cacheKey = "") {
  const base = `/api/admin/characters/${Number(characterId)}/master/image`
  const key = String(cacheKey || "").trim()
  return key ? `${base}?v=${encodeURIComponent(key)}` : base
}

function line(value) {
  const text = String(value || "").trim()
  return text || null
}

export const ELENA_REGEN_APPEARANCE = {
  basePrompt:
    "Elena Varela, Venezuelan Latina woman about 28-32, fair luminous white-Latina skin, light blue or grey-blue eyes, long well-groomed wavy hair, slim model-like refined build, harmonious fine facial features, photogenic leading-lady beauty, photorealistic adult, no text in image",
  wardrobeDefault:
    "Elegant refined casual: a sophisticated long-line sweater or blouse in cream, beige, ivory, sand, or elegant neutrals. Full coverage over the waist and stomach. No crop top. No navel visible.",
  distinguishingFeatures:
    "No nose piercing and no facial piercings. Small elegant earrings only. Subtle elegant makeup. Long wavy hair worn down and well styled.",
}

export function applyElenaRegenAppearance(appearance) {
  const current = appearance && typeof appearance === "object" ? appearance : {}
  return { ...current, ...ELENA_REGEN_APPEARANCE }
}

/**
 * Style brief only. Persisted Character appearance/wardrobe always win on conflict.
 */
export const ELENA_MASTER_VISUAL_BRIEF = [
  "Cinematic master character portrait in 9:16 vertical format, the definitive visual candidate for Elena Varela, Venezuelan Latina protagonist of a premium dramatic vertical short series.",
  "Beautiful, elegant, photogenic, feminine, confident, and emotionally interesting. Expression: serious-soft, contained, intelligent, as if carrying a private secret. Not smiling for a catalog.",
  "Do not show a phone, a second person, episode action, or a specific set piece.",
  "Warm or neutral cinematic interior, softly lit apartment or living room, cream or beige walls, realistic blurred background, premium intimate elegant atmosphere. Soft flattering light on the face. Not a black studio backdrop. Not dark underexposed lighting. Not gothic.",
  "Framing: vertical medium or three-quarter portrait, head to mid-torso, enough room to read face, hair, and outfit. Centered premium leading-lady composition, high facial detail, realistic skin texture, consistent anatomy, cinematic depth of field.",
  "Wardrobe must fully cover the waist. No crop top, no midriff, no navel, no cheap provocative styling, no aggressive streetwear.",
  "Avoid dark skin, tan or medium-brown skin, South Asian or Indian appearance, nose piercing, cartoon, anime, over-stylized fashion editorial, fantasy, sci-fi, cheap catalog glamour, heavy makeup, teenager, elderly, distorted hands or body, duplicate face, multiple people, text overlays, logos, low-detail face, inconsistent anatomy.",
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
    line(appearance.wardrobeDefault) && `WARDROBE LOCK: ${appearance.wardrobeDefault}. Do not substitute a crop top, black coat, jacket, or other outfit.`,
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
