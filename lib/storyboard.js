export const STORYBOARD_V1_FIELDS = Object.freeze([
  "characterIds",
  "location",
  "wardrobe",
  "action",
  "emotion",
  "shot",
  "cameraMovement",
  "lighting",
  "props",
  "continuity",
  "visualPrompt",
])

export function emptyStoryboard() {
  return {
    characterIds: [],
    location: null,
    wardrobe: {},
    action: null,
    emotion: {},
    shot: null,
    cameraMovement: null,
    lighting: null,
    props: [],
    continuity: [],
    visualPrompt: null,
  }
}

function asIntArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
}

function asStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out = {}
  for (const [key, val] of Object.entries(value)) {
    if (val == null || val === "") continue
    out[String(key)] = String(val)
  }
  return out
}

function asPropList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item) return null
      if (typeof item === "string") {
        return { key: item, description: item, continuity: null }
      }
      const key = String(item.key || item.id || "").trim()
      if (!key) return null
      return {
        key,
        description: item.description ? String(item.description) : key,
        continuity: item.continuity ? String(item.continuity) : null,
      }
    })
    .filter(Boolean)
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim()).filter(Boolean)
}

/** Merge raw JSON onto V1 defaults. Unknown keys are kept for forward compatibility. */
export function normalizeStoryboard(raw) {
  const base = emptyStoryboard()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  return {
    ...raw,
    characterIds: asIntArray(raw.characterIds),
    location: raw.location == null || raw.location === "" ? null : String(raw.location),
    wardrobe: asStringMap(raw.wardrobe),
    action: raw.action == null || raw.action === "" ? null : String(raw.action),
    emotion: asStringMap(raw.emotion),
    shot: raw.shot == null || raw.shot === "" ? null : String(raw.shot),
    cameraMovement: raw.cameraMovement == null || raw.cameraMovement === "" ? null : String(raw.cameraMovement),
    lighting: raw.lighting == null || raw.lighting === "" ? null : String(raw.lighting),
    props: asPropList(raw.props),
    continuity: asStringList(raw.continuity),
    visualPrompt: raw.visualPrompt == null || raw.visualPrompt === "" ? null : String(raw.visualPrompt),
  }
}

export function getSceneStoryboard(scene) {
  return normalizeStoryboard(scene?.storyboard)
}

export function patchSceneStoryboard(screenplay, sceneIndex, storyboard) {
  const scenes = Array.isArray(screenplay?.scenes) ? screenplay.scenes : []
  const index = Number(sceneIndex)
  if (!Number.isInteger(index) || index < 0 || index >= scenes.length) {
    throw new Error(`Invalid sceneIndex ${sceneIndex}`)
  }
  const nextScenes = scenes.map((scene, i) => {
    if (i !== index) return scene
    return {
      ...scene,
      storyboard: normalizeStoryboard({ ...getSceneStoryboard(scene), ...storyboard }),
    }
  })
  return { ...screenplay, scenes: nextScenes }
}

/**
 * Ken Burns / Remotion uses scene.zoom_direction ("in" | "out").
 * storyboard.cameraMovement is cinematic intent (slow push-in, handheld, pan left…).
 * They must not be treated as the same field.
 */
export function kenBurnsZoomDirection(scene) {
  const zoom = scene?.zoom_direction
  return zoom === "out" ? "out" : "in"
}

/**
 * Queue still generation without touching other scenes.
 * sceneIndex set → only that scene, even if an Image row already exists (replace/version).
 */
export function selectScenesToGenerate(scenes, existingIndexes, options = {}) {
  const list = Array.isArray(scenes) ? scenes : []
  const existing = existingIndexes instanceof Set ? existingIndexes : new Set(existingIndexes || [])
  const onlyMissing = options.onlyMissing !== false
  if (options.sceneIndex != null && options.sceneIndex !== "") {
    const index = Number(options.sceneIndex)
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      throw new Error(`Invalid sceneIndex ${options.sceneIndex}`)
    }
    return [{ scene: list[index], index }]
  }
  const indexes = Array.isArray(options.sceneIndexes)
    ? options.sceneIndexes.map((i) => Number(i)).filter((i) => Number.isInteger(i) && i >= 0 && i < list.length)
    : null
  if (indexes) {
    return indexes.map((index) => ({ scene: list[index], index }))
  }
  return list
    .map((scene, index) => ({ scene, index }))
    .filter(({ index }) => !onlyMissing || !existing.has(index))
}

export const SCENE4_ELENA_FIXTURE = Object.freeze({
  scene: 4,
  type: "BREAKING_POINT",
  characters: ["Elena"],
  visual_description: "Elena listens to the voicemail again in her apartment.",
  zoom_direction: "in",
  tempo: "slow",
  duration_sec: 10,
  transition: "black_fade",
  storyboard: {
    characterIds: [7],
    location: "elena_apartment",
    wardrobe: { "7": "black wool coat" },
    action: "listens to the message for the second time",
    emotion: { "7": "contained fear" },
    shot: "close-up",
    cameraMovement: "slow push-in",
    lighting: "blue nighttime light",
    props: [
      {
        key: "brother_phone",
        description: "black cracked-screen smartphone",
        continuity: "same object as previous scenes",
      },
    ],
    continuity: [
      "same_phone_as_scene_2",
      "same_outfit_as_scene_3",
      "nighttime",
      "Elena already heard first half of message",
    ],
    visualPrompt: null,
  },
})

export const ELENA_SERIES_BIBLE_FIXTURE = Object.freeze({
  locations: [
    {
      key: "elena_apartment",
      name: "Elena apartment",
      description: "Small night apartment, cool blue window light, cramped hallway to the kitchen",
    },
  ],
  keyEvents: [],
  worldRules: [],
})

export const ELENA_CHARACTER_FIXTURE = Object.freeze({
  id: 7,
  seriesId: 2,
  name: "Elena",
  role: "protagonist",
  appearance: {
    basePrompt: "Latina woman in her early 30s, dark wavy hair, brown eyes, oval face",
    wardrobeDefault: "cream knit sweater",
    distinguishingFeatures: "small gold hoop earrings",
  },
  personality: {
    traits: ["guarded", "loyal"],
    speechPattern: "Quiet, clipped when afraid",
  },
  referenceImageUrl: "characters/2/7/canonical.png",
  referenceEpisode: 1,
})
