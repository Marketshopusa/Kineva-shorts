import { getSceneStoryboard, normalizeStoryboard } from "./storyboard.js"
import { locationKey, resolveCharacterById } from "./character-identity.js"
import { buildSceneVisualPrompt } from "./buildSceneVisualPrompt.js"

function matchByName(characters, name) {
  const needle = String(name || "").trim().toLowerCase()
  if (!needle) return null
  const list = characters || []
  const exact = list.find((c) => String(c?.name || "").trim().toLowerCase() === needle)
  if (exact) return exact
  const first = needle.split(/\s+/)[0]
  const matches = list.filter((c) => String(c?.name || "").trim().toLowerCase().split(/\s+/)[0] === first)
  return matches.length === 1 ? matches[0] : null
}

function idsFromSceneNames(scene, characters) {
  const names = Array.isArray(scene?.characters) ? scene.characters : []
  const ids = []
  const seen = new Set()
  for (const name of names) {
    const character = matchByName(characters, name)
    if (!character || seen.has(character.id)) continue
    seen.add(character.id)
    ids.push(character.id)
  }
  return ids
}

function isMateo(character) {
  return /\bmateo\b/i.test(String(character?.name || ""))
}

/**
 * Episode 1 of LA ÚLTIMA LLAMADA: Mateo is a programmed voicemail, never on-screen.
 * Derived from existing visual_description + text_es, not new plot.
 */
export function classifyEpisode1Presence(scene, characters) {
  const listed = idsFromSceneNames(scene, characters)
  const onScreen = []
  const voiceOnly = []
  for (const id of listed) {
    const character = resolveCharacterById(characters, id)
    if (!character) continue
    if (isMateo(character)) voiceOnly.push(id)
    else onScreen.push(id)
  }
  return { characterIds: listed, onScreenCharacterIds: onScreen, voiceOnlyCharacterIds: voiceOnly }
}

function deriveLocation(visual) {
  const text = String(visual || "")
  if (/departamento de elena/i.test(text) || /sala estrecha de su departamento/i.test(text)) {
    return "Departamento de Elena"
  }
  if (/puerta de iv[aá]n|pasillo/i.test(text)) {
    return "Umbral / pasillo de Iván"
  }
  return null
}

function deriveWardrobe(scene, onScreenIds, characters) {
  const visual = String(scene?.visual_description || "")
  const wardrobe = {}
  for (const id of onScreenIds) {
    const character = resolveCharacterById(characters, id)
    if (!character) continue
    if (/elena/i.test(character.name) && /ropa de casa/i.test(visual)) {
      wardrobe[String(id)] = "ropa de casa, cabello suelto"
    } else if (/elena/i.test(character.name) && /descalza y con el cabello revuelto/i.test(visual)) {
      wardrobe[String(id)] = "descalza, cabello revuelto"
    }
  }
  return wardrobe
}

function deriveShot(visual) {
  if (/^close-up\b/i.test(String(visual || "").trim())) return "close-up"
  return null
}

function deriveLighting(visual) {
  const text = String(visual || "")
  if (/luz tenue del tel[eé]fono/i.test(text)) return "luz tenue del teléfono"
  if (/l[aá]mpara c[aá]lida/i.test(text)) return "lámpara cálida de pie"
  return null
}

function deriveProps(visual) {
  const text = String(visual || "")
  const props = []
  if (/smartphone|tel[eé]fono/i.test(text)) {
    props.push({
      key: "phone",
      description: /smartphone oscuro/i.test(text)
        ? "smartphone oscuro sobre mesa de madera gastada"
        : "teléfono de Elena",
      continuity: null,
    })
  }
  if (/vaso de agua/i.test(text)) {
    props.push({ key: "water_glass", description: "vaso de agua en el fregadero", continuity: null })
  }
  if (/taza de caf[eé]/i.test(text)) {
    props.push({ key: "coffee_cup", description: "taza de café", continuity: null })
  }
  return props
}

/**
 * Enrich one existing scene with Storyboard V1. Does not invent plot.
 * Leaves shot/camera/lighting/emotion null when the screenplay does not name them.
 */
export function deriveStoryboardV1ForScene(scene, characters, { seriesId, episodeNumber } = {}) {
  const existing = getSceneStoryboard(scene)
  const presence = Number(seriesId) === 2 && Number(episodeNumber) === 1
    ? classifyEpisode1Presence(scene, characters)
    : {
      characterIds: existing.characterIds.length ? existing.characterIds : idsFromSceneNames(scene, characters),
      onScreenCharacterIds: existing.onScreenCharacterIds,
      voiceOnlyCharacterIds: existing.voiceOnlyCharacterIds,
    }

  const visual = scene?.visual_description || null
  return normalizeStoryboard({
    ...existing,
    characterIds: presence.characterIds,
    onScreenCharacterIds: presence.onScreenCharacterIds,
    voiceOnlyCharacterIds: presence.voiceOnlyCharacterIds,
    location: existing.location || deriveLocation(visual),
    wardrobe: Object.keys(existing.wardrobe).length ? existing.wardrobe : deriveWardrobe(scene, presence.onScreenCharacterIds, characters),
    action: existing.action || visual,
    emotion: existing.emotion,
    shot: existing.shot || deriveShot(visual),
    cameraMovement: existing.cameraMovement || null,
    lighting: existing.lighting || deriveLighting(visual),
    props: existing.props.length ? existing.props : deriveProps(visual),
    continuity: existing.continuity,
    visualPrompt: existing.visualPrompt || null,
  })
}

export function persistStoryboardV1OnScreenplay(screenplay, characters, { seriesId, episodeNumber, series } = {}) {
  const scenes = Array.isArray(screenplay?.scenes) ? screenplay.scenes : []
  const nextScenes = scenes.map((scene) => {
    const { storyboard: _ignored, ...rest } = scene
    const board = deriveStoryboardV1ForScene(scene, characters, { seriesId, episodeNumber })
    const withBoard = { ...rest, storyboard: board }
    const built = buildSceneVisualPrompt({
      scene: withBoard,
      characters,
      series: series || { id: seriesId },
    })
    return {
      ...rest,
      storyboard: {
        ...board,
        visualPrompt: board.visualPrompt || built.prompt || null,
      },
    }
  })
  return { ...screenplay, scenes: nextScenes }
}

export { locationKey }
