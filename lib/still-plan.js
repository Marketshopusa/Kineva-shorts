import {
  isVisualIdentityLocked,
  requiredVisualCharactersNotLocked,
  resolveOnScreenCharacters,
  resolveVoiceOnlyCharacters,
  resolveCharactersForScene,
  scenePresencePrepared,
  sceneEmotionForCharacter,
  sceneWardrobeForCharacter,
} from "./character-identity.js"
import { getSceneStoryboard } from "./storyboard.js"
import {
  STILL_ROUTE_MULTI_REFERENCE,
  STILL_ROUTE_SINGLE_REFERENCE,
  STILL_ROUTE_TEXT,
} from "./providers/images/still-request.js"

export const REQUIRED_VISUAL_CHARACTER_NOT_LOCKED = "REQUIRED_VISUAL_CHARACTER_NOT_LOCKED"
export const STORYBOARD_ON_SCREEN_UNSET = "STORYBOARD_ON_SCREEN_UNSET"
export const CANONICAL_REFERENCE_UNRESOLVED = "CANONICAL_REFERENCE_UNRESOLVED"
export const IMAGES_BUCKET_NOT_READY = "IMAGES_BUCKET_NOT_READY"

export function providerRouteForCount(count) {
  if (count >= 2) return "MULTI_REFERENCE"
  if (count === 1) return "SINGLE_REFERENCE"
  return "TEXT_ONLY"
}

export function stillRouteForCount(count) {
  if (count >= 2) return STILL_ROUTE_MULTI_REFERENCE
  if (count === 1) return STILL_ROUTE_SINGLE_REFERENCE
  return STILL_ROUTE_TEXT
}

/**
 * Plan a still without calling Fal. Visual refs are on-screen locked characters only.
 */
export function planSceneStill(scene, characters) {
  const board = getSceneStoryboard(scene)
  const listed = resolveCharactersForScene(scene, characters)
  const prepared = scenePresencePrepared(scene)
  const onScreen = prepared ? resolveOnScreenCharacters(scene, characters) : []
  const voiceOnly = prepared ? resolveVoiceOnlyCharacters(scene, characters) : []
  const unlockedVisual = requiredVisualCharactersNotLocked(onScreen)
  const lockedOnScreen = onScreen.filter((character) => isVisualIdentityLocked(character))
  const references = lockedOnScreen.map((character, index) => ({
    index: index + 1,
    characterId: character.id,
    name: character.name,
    storagePath: character.referenceImageUrl,
  }))

  let blockReason = null
  let ready = false
  if (!prepared) {
    blockReason = STORYBOARD_ON_SCREEN_UNSET
  } else if (unlockedVisual.length) {
    blockReason = `${REQUIRED_VISUAL_CHARACTER_NOT_LOCKED}:${unlockedVisual.map((c) => c.name).join(",")}`
  } else {
    ready = true
  }

  return {
    prepared,
    listed: listed.map((c) => ({ id: c.id, name: c.name })),
    onScreen: onScreen.map((c) => ({ id: c.id, name: c.name, locked: isVisualIdentityLocked(c) })),
    voiceOnly: voiceOnly.map((c) => ({ id: c.id, name: c.name, locked: isVisualIdentityLocked(c) })),
    references,
    providerRoute: providerRouteForCount(references.length),
    stillRoute: stillRouteForCount(references.length),
    ready,
    blockReason,
    location: board.location,
    wardrobe: onScreen.map((c) => {
      const w = sceneWardrobeForCharacter(c, board)
      return w ? { characterId: c.id, wardrobe: w } : null
    }).filter(Boolean),
    action: board.action,
  }
}

export function sceneStillPreflightError(plan) {
  if (!plan?.blockReason) return null
  const err = new Error(plan.blockReason)
  err.code = plan.blockReason.startsWith(REQUIRED_VISUAL_CHARACTER_NOT_LOCKED)
    ? REQUIRED_VISUAL_CHARACTER_NOT_LOCKED
    : plan.blockReason
  return err
}

export function planEpisodeStills(screenplay, characters) {
  const scenes = Array.isArray(screenplay?.scenes) ? screenplay.scenes : []
  return scenes.map((scene, index) => ({
    sceneIndex: index,
    scene: scene.scene ?? index + 1,
    ...planSceneStill(scene, characters),
  }))
}

/** Identity/storyboard gate. Throws before any paid generate callback. */
export async function runStillGenerationIfReady(plan, generateFn) {
  const err = sceneStillPreflightError(plan)
  if (err) throw err
  return generateFn()
}
