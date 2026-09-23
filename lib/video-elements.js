import {
  isVisualIdentityLocked,
  resolveOnScreenCharacters,
  resolveVoiceOnlyCharacters,
} from "./character-identity.js"
import {
  assertProviderUrlNotPrivate,
  resolveCharacterReferenceForProvider,
} from "./character-reference-provider.js"
import { REQUIRED_VISUAL_CHARACTER_NOT_LOCKED } from "./still-plan.js"

export const ELENA_CHARACTER_ID = 2
export const IVAN_CHARACTER_ID = 4
export const MATEO_CHARACTER_ID = 3

export function isElenaCharacter(character) {
  return Number(character?.id) === ELENA_CHARACTER_ID || /^elena\b/i.test(String(character?.name || ""))
}

export function isIvanCharacter(character) {
  return Number(character?.id) === IVAN_CHARACTER_ID || /^iv[aá]n\b/i.test(String(character?.name || ""))
}

export function isMateoCharacter(character) {
  return Number(character?.id) === MATEO_CHARACTER_ID || /\bmateo\b/i.test(String(character?.name || ""))
}

/** Elena is always @Element1, Iván always @Element2 when both are on screen. */
export function orderCharactersForElements(characters) {
  const list = (characters || []).filter(Boolean).filter((c) => !isMateoCharacter(c))
  return [...list].sort((a, b) => {
    const rank = (character) => {
      if (isElenaCharacter(character)) return 0
      if (isIvanCharacter(character)) return 1
      return 10
    }
    const delta = rank(a) - rank(b)
    if (delta !== 0) return delta
    return Number(a.id) - Number(b.id)
  })
}

export function characterElementTag(index) {
  return `@Element${index}`
}

export function mapCharacterElements(onScreenCharacters) {
  const ordered = orderCharactersForElements(onScreenCharacters)
  return ordered.map((character, index) => ({
    elementIndex: index + 1,
    tag: characterElementTag(index + 1),
    characterId: Number(character.id),
    name: String(character.name || ""),
    storagePath: character.referenceImageUrl || null,
    locked: isVisualIdentityLocked(character),
    role: isElenaCharacter(character) ? "elena" : isIvanCharacter(character) ? "ivan" : "other",
  }))
}

export function sceneVideoPresence(scene, characters) {
  const onScreen = resolveOnScreenCharacters(scene, characters)
  const voiceOnly = resolveVoiceOnlyCharacters(scene, characters)
  return {
    onScreenCharacterIds: onScreen.map((c) => Number(c.id)),
    voiceOnlyCharacterIds: voiceOnly.map((c) => Number(c.id)),
    onScreen,
    voiceOnly,
    characterElements: mapCharacterElements(onScreen),
  }
}

export function assertNoMateoVisual(elements) {
  for (const element of elements || []) {
    if (isMateoCharacter(element) || Number(element.characterId) === MATEO_CHARACTER_ID || /\bmateo\b/i.test(element.name || "")) {
      const err = new Error("MATEO_MUST_REMAIN_VOICE_ONLY")
      err.code = "MATEO_MUST_REMAIN_VOICE_ONLY"
      throw err
    }
  }
  return elements
}

/**
 * Sign canonicals for Kling elements. Never writes signed URLs onto Character.
 */
export async function resolveVideoElementsForProvider(onScreenCharacters, deps = {}) {
  const mapped = mapCharacterElements(onScreenCharacters)
  assertNoMateoVisual(mapped)
  const unlocked = mapped.filter((item) => !item.locked || !item.storagePath)
  if (unlocked.length) {
    const err = new Error(
      `${REQUIRED_VISUAL_CHARACTER_NOT_LOCKED}:${unlocked.map((c) => c.name).join(",")}`,
    )
    err.code = REQUIRED_VISUAL_CHARACTER_NOT_LOCKED
    throw err
  }

  const resolved = []
  for (const item of mapped) {
    const character = onScreenCharacters.find((c) => Number(c.id) === item.characterId)
    const signed = await resolveCharacterReferenceForProvider(character, deps)
    assertProviderUrlNotPrivate(signed.providerUrl)
    resolved.push({
      ...item,
      storagePath: signed.storagePath,
      durablePath: signed.durablePath,
      providerUrl: signed.providerUrl,
      falElement: {
        frontal_image_url: signed.providerUrl,
      },
    })
  }
  return resolved
}

export function publicVideoElements(elements) {
  return (elements || []).map((item) => ({
    elementIndex: item.elementIndex,
    tag: item.tag,
    characterId: item.characterId,
    name: item.name,
    storagePath: item.storagePath,
    role: item.role,
    locked: item.locked !== false,
  }))
}

export function falElementsFromResolved(elements) {
  return (elements || []).map((item) => {
    const frontal = item.falElement?.frontal_image_url || item.providerUrl
    assertProviderUrlNotPrivate(frontal)
    return { frontal_image_url: frontal }
  })
}
