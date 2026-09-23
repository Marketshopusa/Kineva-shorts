import { getSceneStoryboard } from "./storyboard.js"

export const VISUAL_IDENTITY_LOCKED = "LOCKED"
export const VISUAL_IDENTITY_NOT_LOCKED = "NOT LOCKED"

export function visualIdentityStatus(character) {
  return character?.referenceImageUrl ? VISUAL_IDENTITY_LOCKED : VISUAL_IDENTITY_NOT_LOCKED
}

export function isVisualIdentityLocked(character) {
  return visualIdentityStatus(character) === VISUAL_IDENTITY_LOCKED
}

/**
 * V1 uses Character.referenceImageUrl as the approved canonical still.
 * Extra pack slots are reserved for later (canonicalFace/body/wardrobe/expressions).
 */
export function characterReferencePack(character) {
  const extra = character?.referencePack && typeof character.referencePack === "object"
    ? character.referencePack
    : {}
  return {
    canonicalFace: character?.referenceImageUrl || extra.canonicalFace || null,
    bodyReference: extra.bodyReference || null,
    wardrobeReference: extra.wardrobeReference || null,
    expressionReferences: Array.isArray(extra.expressionReferences) ? extra.expressionReferences : [],
  }
}

export function locationKey(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

export function resolveStoryboardLocation(locationRef, seriesBible) {
  if (!locationRef) return null
  const key = String(locationRef)
  const locs = seriesBible?.locations || []
  const found = locs.find((loc) => {
    if (!loc) return false
    if (loc.key && String(loc.key) === key) return true
    if (loc.id != null && String(loc.id) === key) return true
    if (loc.name && String(loc.name).toLowerCase() === key.toLowerCase()) return true
    if (loc.name && locationKey(loc.name) === locationKey(key)) return true
    return false
  })
  if (found) {
    return {
      key: found.key || locationKey(found.name || key),
      name: found.name || key,
      description: found.description || null,
      resolved: true,
    }
  }
  return { key: locationKey(key) || key, name: key, description: null, resolved: false }
}

function matchCharacterByName(characters, name) {
  const needle = String(name || "").toLowerCase()
  return (characters || []).find((c) => String(c?.name || "").toLowerCase() === needle) || null
}

export function resolveCharacterById(characters, characterId) {
  const id = Number(characterId)
  if (!Number.isInteger(id) || id <= 0) return null
  return (characters || []).find((c) => Number(c?.id) === id) || null
}

function mapIdsToCharacters(ids, characters) {
  const list = Array.isArray(characters) ? characters : []
  const resolved = []
  const seen = new Set()
  for (const id of ids || []) {
    const character = resolveCharacterById(list, id)
    if (!character || seen.has(character.id)) continue
    seen.add(character.id)
    resolved.push(character)
  }
  return resolved
}

/**
 * Prefer storyboard.characterIds. Fall back to scene.characters[] names for old JSON.
 */
export function resolveCharactersForScene(scene, characters) {
  const list = Array.isArray(characters) ? characters : []
  const board = getSceneStoryboard(scene)
  const resolved = mapIdsToCharacters(board.characterIds, list)

  if (resolved.length === 0 && Array.isArray(scene?.characters)) {
    const seen = new Set()
    for (const name of scene.characters) {
      const character = matchCharacterByName(list, name)
      if (!character || seen.has(character.id)) continue
      seen.add(character.id)
      resolved.push(character)
    }
  }

  return resolved
}

export function scenePresencePrepared(scene) {
  const board = getSceneStoryboard(scene)
  return board.onScreenCharacterIds.length > 0 || board.voiceOnlyCharacterIds.length > 0
}

/** Visual stills use on-screen ids only. Voice-only never becomes a still reference. */
export function resolveOnScreenCharacters(scene, characters) {
  const board = getSceneStoryboard(scene)
  if (!scenePresencePrepared(scene)) return []
  return mapIdsToCharacters(board.onScreenCharacterIds, characters)
}

export function resolveVoiceOnlyCharacters(scene, characters) {
  const board = getSceneStoryboard(scene)
  return mapIdsToCharacters(board.voiceOnlyCharacterIds, characters)
}

export function requiredVisualCharactersNotLocked(onScreenCharacters) {
  return (onScreenCharacters || []).filter((character) => !isVisualIdentityLocked(character))
}

export function sceneWardrobeForCharacter(character, storyboard) {
  if (!character) return null
  const board = storyboard && typeof storyboard === "object" ? storyboard : {}
  const wardrobe = board.wardrobe && typeof board.wardrobe === "object" ? board.wardrobe : {}
  const override = wardrobe[String(character.id)] ?? wardrobe[character.id]
  if (override) return String(override)
  return character.appearance?.wardrobeDefault || null
}

export function sceneEmotionForCharacter(character, storyboard) {
  if (!character) return null
  const emotion = storyboard?.emotion && typeof storyboard.emotion === "object" ? storyboard.emotion : {}
  const value = emotion[String(character.id)] ?? emotion[character.id]
  return value ? String(value) : null
}

export function primarySceneReferenceUrl(resolvedCharacters) {
  for (const character of resolvedCharacters || []) {
    if (character?.referenceImageUrl) return character.referenceImageUrl
  }
  return null
}

export function orderedOnScreenReferences(onScreenCharacters) {
  return (onScreenCharacters || [])
    .filter((character) => character?.referenceImageUrl)
    .map((character) => ({
      characterId: character.id,
      name: character.name,
      storagePath: character.referenceImageUrl,
    }))
}

/** Episode 1 and Episode 2 must resolve the same series-scoped identity. */
export function resolveSeriesCharacterIdentity(characters, characterId) {
  const character = resolveCharacterById(characters, characterId)
  if (!character) return null
  return {
    characterId: character.id,
    name: character.name,
    referenceImageUrl: character.referenceImageUrl || null,
    visualIdentity: visualIdentityStatus(character),
    appearance: character.appearance || null,
  }
}

export function characterReferenceDisplaySrc(character) {
  const url = character?.referenceImageUrl
  if (!url) return null
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("/")) {
    return url
  }
  return `/api/admin/characters/${character.id}/reference`
}
