import { getVisualStyle } from "../config/visualStyles.js"
import {
  getSceneStoryboard,
  kenBurnsZoomDirection,
} from "./storyboard.js"
import {
  isVisualIdentityLocked,
  resolveOnScreenCharacters,
  resolveVoiceOnlyCharacters,
  resolveStoryboardLocation,
  sceneEmotionForCharacter,
  scenePresencePrepared,
  sceneWardrobeForCharacter,
} from "./character-identity.js"
import { planSceneStill, stillRouteForCount } from "./still-plan.js"

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
 * Scene Visual Prompt V2. Faces come from ordered on-screen reference images,
 * never from a "must match" sentence. Voice-only characters are not drawn.
 */
export function buildSceneVisualPrompt({
  scene,
  characters,
  series,
  continuity,
  maxLength = 0,
} = {}) {
  const board = getSceneStoryboard(scene)
  const prepared = scenePresencePrepared(scene)
  const onScreen = prepared ? resolveOnScreenCharacters(scene, characters) : []
  const voiceOnly = prepared ? resolveVoiceOnlyCharacters(scene, characters) : []
  const style = getVisualStyle(series?.visualStyle || "cinematic")
  const location = resolveStoryboardLocation(board.location, series?.seriesBible)
  const extraContinuity = Array.isArray(continuity) ? continuity : []
  const parts = []
  const references = []

  onScreen.forEach((character, index) => {
    const locked = isVisualIdentityLocked(character)
    const wardrobe = sceneWardrobeForCharacter(character, board)
    const emotion = sceneEmotionForCharacter(character, board)
    const refIndex = index + 1
    const lines = [`${character.name} (id ${character.id})`]
    if (locked) {
      lines.push(`visual identity LOCKED — Reference image ${refIndex}`)
      references.push({
        index: refIndex,
        characterId: character.id,
        name: character.name,
        storagePath: character.referenceImageUrl,
      })
    } else if (character.appearance?.basePrompt) {
      lines.push(character.appearance.basePrompt)
    }
    if (wardrobe) lines.push(`wardrobe ${wardrobe}`)
    if (!locked && character.appearance?.distinguishingFeatures) {
      lines.push(character.appearance.distinguishingFeatures)
    }
    if (emotion) lines.push(`emotion ${emotion}`)
    pushSection(parts, "PERSONAJE ON-SCREEN", lines.join("; "))
  })

  references.forEach((item) => {
    parts.push(`Reference image ${item.index} = ${item.name} (Character #${item.characterId})`)
  })

  for (const character of voiceOnly) {
    pushSection(
      parts,
      "VOICE-ONLY",
      `${character.name} (id ${character.id}) is audio only. Do not draw this person on screen.`,
    )
  }

  if (location) {
    const locText = [location.name, location.description].filter(Boolean).join(" — ")
    pushSection(parts, "LUGAR", locText)
  }

  const wardrobeSummary = onScreen
    .map((character) => {
      const w = sceneWardrobeForCharacter(character, board)
      return w ? `${character.name}: ${w}` : null
    })
    .filter(Boolean)
    .join("; ")
  pushSection(parts, "VESTUARIO", wardrobeSummary)

  const action = board.action || scene?.visual_description || null
  pushSection(parts, "ACCIÓN", action)

  const emotionSummary = onScreen
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

  void kenBurnsZoomDirection(scene)

  const rebuilt = parts.join("\n")
  const persistedPrompt = board.visualPrompt
  const identityLock = references.length
    ? "Keep the exact facial identity of the reference image(s). Same person, same face, same eye color, same hair. This is a narrative scene still, not a character-master portrait."
    : null
  const promptBase = persistedPrompt || rebuilt
  const withIdentity = identityLock && !/exact facial identity/i.test(promptBase)
    ? `${promptBase}\n${identityLock}`
    : promptBase
  const prompt = truncateAtSentence(withIdentity, maxLength)
  const referenceImageUrl = references[0]?.storagePath || null
  const plan = planSceneStill(scene, characters)
  return {
    prompt,
    referenceImageUrl,
    referenceImageUrls: references.map((item) => item.storagePath),
    references,
    visualIdentity: references.length ? "LOCKED" : "NOT LOCKED",
    characterIds: onScreen.map((c) => c.id),
    onScreenCharacterIds: onScreen.map((c) => c.id),
    voiceOnlyCharacterIds: voiceOnly.map((c) => c.id),
    route: stillRouteForCount(references.length),
    providerRoute: plan.providerRoute,
    ready: plan.ready,
    blockReason: plan.blockReason,
  }
}

export function buildSceneVisualPromptText(args) {
  return buildSceneVisualPrompt(args).prompt
}
