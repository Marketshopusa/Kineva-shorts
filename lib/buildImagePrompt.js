import { getVisualStyle } from "@/config/visualStyles"

export function buildImagePrompt({ scene, characters, series, maxLength = 0 }) {
  const style = getVisualStyle(series?.visualStyle || "cinematic")
  const parts = []

  // Scene description first
  if (scene.visual_description) {
    parts.push(scene.visual_description)
  }

  // Character appearance blocks — injected verbatim, never AI-generated
  if (scene.characters?.length > 0 && characters?.length > 0) {
    for (const charName of scene.characters) {
      const char = characters.find(
        (c) => c.name.toLowerCase() === charName.toLowerCase()
      )
      if (char?.appearance?.basePrompt) {
        const block = [
          char.appearance.basePrompt,
          char.appearance.wardrobeDefault,
          char.appearance.distinguishingFeatures,
        ]
          .filter(Boolean)
          .join(". ")
        parts.push(block)

        // Reference image anchor text — used when Gemini can't receive image inlineData
        if (char.referenceImageUrl) {
          parts.push(
            `${char.name}'s appearance must exactly match their established visual reference (locked in episode ${char.referenceEpisode || "prior"})`
          )
        }
      }
    }
  }

  // Global style prompt from series (freeform override, optional)
  if (series?.globalStylePrompt) {
    parts.push(series.globalStylePrompt)
  }

  // Visual style preset
  const formatBase = `9:16 portrait orientation, ${style.promptSuffix}`
  parts.push(formatBase)

  let prompt = parts.join(". ")

  // Truncate at sentence boundary if maxLength is set
  if (maxLength > 0 && prompt.length > maxLength) {
    const truncated = prompt.slice(0, maxLength)
    const lastDot = truncated.lastIndexOf(". ")
    prompt = lastDot > 0 ? truncated.slice(0, lastDot + 1) : truncated
  }

  return prompt
}

/**
 * Collect character reference image URLs for Gemini inline injection.
 * Returns an array of { charName, imageUrl } for characters in this scene
 * who have a referenceImageUrl set.
 */
export function getSceneCharacterReferences(scene, characters) {
  if (!scene.characters?.length || !characters?.length) return []
  const refs = []
  for (const charName of scene.characters) {
    const char = characters.find((c) => c.name.toLowerCase() === charName.toLowerCase())
    if (char?.referenceImageUrl) {
      refs.push({ charName: char.name, imageUrl: char.referenceImageUrl, episode: char.referenceEpisode })
    }
  }
  return refs
}
