import { getVisualStyle } from "../config/visualStyles.js"
import {
  getSceneStoryboard,
  kenBurnsZoomDirection,
} from "./storyboard.js"
import {
  isVisualIdentityLocked,
  primarySceneReferenceUrl,
  resolveCharactersForScene,
  resolveStoryboardLocation,
  sceneEmotionForCharacter,
  sceneWardrobeForCharacter,
} from "./character-identity.js"

function pushSection(parts, label, value) {
  if (value == null || value === "") return
  parts.push(`${label}: ${value}`)
}

function truncateAtSentence(prompt, maxLength) {
  if (!(maxLength > 0) || prompt.length <= maxLength) return prompt
  const truncated = prompt.slice(0, maxLength)
  const lastDot = truncated.lastIndexOf(". ")
  return lastDot > 0 ? truncated.slice(0, lastDot + 1) : truncated
}

/**
 * Structured still prompt. Facial identity is NOT encoded as "must match this image"
 * when a canonical reference exists — that image is sent separately to the provider.
 */
export function buildSceneVisualPrompt({
  scene,
  characters,
  series,
  continuity,
  maxLength = 0,
} = {}) {
  const board = getSceneStoryboard(scene)
  const resolved = resolveCharactersForScene(scene, characters)
  const style = getVisualStyle(series?.visualStyle || "cinematic")
  const location = resolveStoryboardLocation(board.location, series?.seriesBible)
  const extraContinuity = Array.isArray(continuity) ? continuity : []
  const parts = []

  if (resolved.length > 0) {
    for (const character of resolved) {
      const locked = isVisualIdentityLocked(character)
      const wardrobe = sceneWardrobeForCharacter(character, board)
      const emotion = sceneEmotionForCharacter(character, board)
      const lines = [`${character.name} (id ${character.id})`]
      if (locked) {
        lines.push("visual identity LOCKED — face supplied as canonical reference image")
      } else if (character.appearance?.basePrompt) {
        lines.push(character.appearance.basePrompt)
      }
      if (wardrobe) lines.push(`wardrobe ${wardrobe}`)
      if (!locked && character.appearance?.distinguishingFeatures) {
        lines.push(character.appearance.distinguishingFeatures)
      }
      if (emotion) lines.push(`emotion ${emotion}`)
      pushSection(parts, "PERSONAJE", lines.join("; "))
    }
  } else if (Array.isArray(scene?.characters) && scene.characters.length > 0) {
    pushSection(parts, "PERSONAJE", scene.characters.join(", "))
  }

  if (location) {
    const locText = [location.name, location.description].filter(Boolean).join(" — ")
    pushSection(parts, "LUGAR", locText)
  }

  const wardrobeSummary = resolved
    .map((character) => {
      const w = sceneWardrobeForCharacter(character, board)
      return w ? `${character.name}: ${w}` : null
    })
    .filter(Boolean)
    .join("; ")
  pushSection(parts, "VESTUARIO", wardrobeSummary)

  const action = board.action || scene?.visual_description || null
  pushSection(parts, "ACCIÓN", action)

  const emotionSummary = resolved
    .map((character) => {
      const e = sceneEmotionForCharacter(character, board)
      return e ? `${character.name}: ${e}` : null
    })
    .filter(Boolean)
    .join("; ")
  pushSection(parts, "EMOCIÓN", emotionSummary)

  pushSection(parts, "SHOT", board.shot)
  pushSection(parts, "CÁMARA", board.cameraMovement)
  pushSection(parts, "ILUMINACIÓN", board.lighting)

  if (board.props.length > 0) {
    const propText = board.props
      .map((prop) => {
        const bits = [prop.key, prop.description]
        if (prop.continuity) bits.push(prop.continuity)
        return bits.filter(Boolean).join(" — ")
      })
      .join("; ")
    pushSection(parts, "PROPS", propText)
  }

  const continuityBits = [...board.continuity, ...extraContinuity]
  pushSection(parts, "CONTINUIDAD", continuityBits.join("; "))

  if (series?.globalStylePrompt) {
    pushSection(parts, "ESTILO GLOBAL", series.globalStylePrompt)
  }

  parts.push(`FORMAT: 9:16 portrait orientation, ${style.promptSuffix}`)

  if (board.visualPrompt) {
    parts.push(board.visualPrompt)
  }

  // zoom_direction is Ken Burns playback, not a still-camera instruction
  void kenBurnsZoomDirection(scene)

  const prompt = parts.join("\n")
  const referenceImageUrl = primarySceneReferenceUrl(resolved)
  return {
    prompt: truncateAtSentence(prompt, maxLength),
    referenceImageUrl,
    visualIdentity: referenceImageUrl ? "LOCKED" : "NOT LOCKED",
    characterIds: resolved.map((c) => c.id),
    route: referenceImageUrl ? "reference-aware" : "text-only",
  }
}

export function buildSceneVisualPromptText(args) {
  return buildSceneVisualPrompt(args).prompt
}
