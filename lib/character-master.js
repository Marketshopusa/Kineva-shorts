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
 * Character master prompt from persisted Character + Series only.
 * Not a scene still: no phone, apartment, episode action, or other people.
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
    "Cinematic character-reference portrait of one adult woman, realistic human skin, premium film still, not plastic, not CGI.",
    "Medium shot, face fully visible and recognizable, upper body included for continuity, calm neutral expression.",
    "Controlled cinematic lighting, discreet out-of-focus background, wardrobe consistent with the character.",
    "No other people, no text, no logo, no subtitles, no watermark.",
    "Not a dramatic episode beat: no phone, no apartment set piece, no extreme emotion, no specific plot action.",
  ]
  const appearanceBits = [
    line(appearance.basePrompt),
    line(appearance.wardrobeDefault) && `Wardrobe: ${appearance.wardrobeDefault}`,
    line(appearance.distinguishingFeatures) && `Distinguishing features: ${appearance.distinguishingFeatures}`,
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
  return lines.join("\n")
}

export const CHARACTER_MASTER_ASPECT = "9:16"
export const CHARACTER_MASTER_SIZE = { width: 1080, height: 1920 }
export const CHARACTER_MASTER_MODEL = "fal-ai/flux/dev"
