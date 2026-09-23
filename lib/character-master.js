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

export function characterLookRefPrefix(seriesId, characterId) {
  return `characters/${Number(seriesId)}/${Number(characterId)}/look-refs`
}

export function characterLookRefPath(seriesId, characterId, filename) {
  const name = String(filename || "").replace(/[^a-zA-Z0-9._-]/g, "")
  if (!name) throw new Error("look-ref filename is required")
  return `${characterLookRefPrefix(seriesId, characterId)}/${name}`
}

export const ELENA_LOOK_REF_PRIMARY = "model-feminine-a.jpg"
export const ELENA_LOOK_REF_SECONDARY = "model-feminine-b.jpg"

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

export const ELENA_MAX_MASTER_CANDIDATES = 4

export function elenaMasterGenerateAllowed(candidates, { regenerate = false } = {}) {
  const count = Array.isArray(candidates) ? candidates.length : 0
  if (regenerate) return count > 0 && count < ELENA_MAX_MASTER_CANDIDATES
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
    "Elena Varela, Venezuelan Latina woman 28-32, fair luminous white-Latina skin, green eyes, long well-groomed wavy auburn-red hair worn down, slim feminine model-like build. FACE: oval feminine face, softly tapered jaw, small rounded female chin, delicate cheekbones. Clearly a woman. Photoreal DSLR photograph of a real person, natural skin texture and pores, adult, no text in image",
  wardrobeDefault:
    "Elegant cream or ivory knit sweater with full coverage over the waist and stomach. Feminine silhouette. No crop top. No navel visible.",
  distinguishingFeatures:
    "Soft rounded feminine chin, not square and not masculine. Oval face, not boxy. Long wavy auburn-red hair worn down. Green eyes. Cream ivory knit sweater. No nose piercing. Small elegant earrings only. Subtle natural makeup.",
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
  "Very feminine leading-lady beauty, photogenic, elegant, and believable like a real photograph of a real woman. Soft natural expression, slight warmth in the eyes, not a stiff mannequin stare, not a cheap catalog grin.",
  "FACE SHAPE LOCK: oval or heart-shaped face. Narrow softly tapered jaw. Small rounded feminine chin. Delicate lower face. MUST NOT have a square face, wide jaw, heavy chin, lantern jaw, or masculine bone structure.",
  "REALISM LOCK: shot on a real camera, natural skin, visible pores, tiny real imperfections, truthful lighting, sharp eyes. Not CGI, not plastic, not airbrushed doll skin, not video-game, not over-smoothed AI face.",
  "Do not show a phone, a second person, episode action, or a specific set piece. Do not imitate a known celebrity.",
  "Warm or neutral cinematic interior or softly lit lifestyle setting, cream or beige surroundings, realistic blurred background, premium intimate elegant atmosphere. Soft flattering daylight. Not a black studio backdrop. Not dark underexposed lighting. Not gothic.",
  "Framing: vertical medium portrait, head to mid-torso, face large and readable, hair and outfit visible. Centered premium leading-lady composition.",
  "Wardrobe must fully cover the waist. No crop top, no midriff, no navel, no cheap provocative styling.",
  "Avoid square jaw, masculine chin, androgynous face, dark skin, South Asian or Indian appearance, nose piercing, cartoon, anime, fantasy, sci-fi, teenager, elderly, distorted anatomy, duplicate face, multiple people, text overlays, logos.",
].join(" ")

/**
 * Character master prompt. Persisted Character + Series identity outranks the style brief.
 * Not a scene still: no phone prop, no other people, no Mateo, no Iván.
 */
export function buildCharacterMasterPrompt(character, series, { lookReference = false } = {}) {
  const appearance = character?.appearance && typeof character.appearance === "object"
    ? character.appearance
    : {}
  const personality = character?.personality && typeof character.personality === "object"
    ? character.personality
    : {}
  const lines = [
    "ELENA VARELA — CHARACTER MASTER",
    "Single adult woman, photorealistic cinematic still, 9:16. Not CGI, not plastic. No other people, no text, no logo, no watermark.",
    lookReference
      ? "LOOK REFERENCE PHOTO: match the facial fractions of the attached model photograph — oval feminine face, soft rounded chin, delicate jaw, light eyes, photogenic bone structure, real-camera skin. New original woman, not a celebrity lookalike, not the previous Elena still."
      : "Persisted Character fields are the identity lock and override any later style request.",
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

export const APPROVED_ELENA_CANDIDATE_PATH =
  "characters/2/2/candidates/99f0ab02-cbd5-43d5-8cee-06320df4fb70.png"

export function isApprovedElenaCandidatePath(storagePath) {
  return String(storagePath || "") === APPROVED_ELENA_CANDIDATE_PATH
}

export const CHARACTER_MASTER_ASPECT = "9:16"
export const CHARACTER_MASTER_SIZE = { width: 1080, height: 1920 }
export const CHARACTER_MASTER_MODEL = "fal-ai/flux/dev"
