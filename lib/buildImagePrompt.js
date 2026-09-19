import { buildSceneVisualPrompt } from "./buildSceneVisualPrompt.js"
import { resolveCharactersForScene, primarySceneReferenceUrl } from "./character-identity.js"

export function buildImagePrompt({ scene, characters, series, maxLength = 0 }) {
  return buildSceneVisualPrompt({ scene, characters, series, maxLength }).prompt
}

/**
 * Collect character reference image URLs for provider injection.
 * Prefers storyboard.characterIds; falls back to scene.characters[] names.
 */
export function getSceneCharacterReferences(scene, characters) {
  const resolved = resolveCharactersForScene(scene, characters)
  return resolved
    .filter((char) => char?.referenceImageUrl)
    .map((char) => ({
      charName: char.name,
      characterId: char.id,
      imageUrl: char.referenceImageUrl,
      episode: char.referenceEpisode,
    }))
}

export function getPrimarySceneReferenceUrl(scene, characters) {
  return primarySceneReferenceUrl(resolveCharactersForScene(scene, characters))
}
