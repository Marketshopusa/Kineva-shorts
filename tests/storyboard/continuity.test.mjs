import test from "node:test"
import assert from "node:assert/strict"
import {
  SCENE4_ELENA_FIXTURE,
  ELENA_SERIES_BIBLE_FIXTURE,
  ELENA_CHARACTER_FIXTURE,
  emptyStoryboard,
  getSceneStoryboard,
  kenBurnsZoomDirection,
  normalizeStoryboard,
  patchSceneStoryboard,
  selectScenesToGenerate,
  STORYBOARD_V1_FIELDS,
} from "../../lib/storyboard.js"
import {
  characterReferencePack,
  primarySceneReferenceUrl,
  resolveCharacterById,
  resolveCharactersForScene,
  resolveSeriesCharacterIdentity,
  resolveStoryboardLocation,
  sceneWardrobeForCharacter,
  visualIdentityStatus,
} from "../../lib/character-identity.js"
import { characterCanonicalPath, persistCanonicalReference } from "../../lib/character-reference-storage.js"
import { buildSceneVisualPrompt, buildSceneVisualPromptText } from "../../lib/buildSceneVisualPrompt.js"
import { buildImagePrompt } from "../../lib/buildImagePrompt.js"
import {
  STILL_ROUTE_REFERENCE,
  STILL_ROUTE_TEXT,
  buildFalStillRequest,
  buildGeminiStillContents,
  selectStillRoute,
} from "../../lib/providers/images/still-request.js"
import { generateFalStill } from "../../lib/providers/images/fal.js"

const OLD_SCENE = {
  scene: 1,
  type: "HOOK",
  characters: ["Elena"],
  visual_description: "A woman stands in a dark kitchen holding a phone",
  zoom_direction: "in",
  tempo: "fast",
  duration_sec: 5,
  transition: "black_fade",
}

const SERIES = {
  id: 2,
  title: "LA ÚLTIMA LLAMADA",
  visualStyle: "cinematic",
  globalStylePrompt: "cool blue night palette",
  seriesBible: ELENA_SERIES_BIBLE_FIXTURE,
}

function unlockedElena() {
  return { ...ELENA_CHARACTER_FIXTURE, referenceImageUrl: null, referenceEpisode: null }
}

test("1. old scene JSON still builds a still prompt", () => {
  const prompt = buildImagePrompt({
    scene: OLD_SCENE,
    characters: [unlockedElena()],
    series: SERIES,
  })
  assert.match(prompt, /A woman stands in a dark kitchen holding a phone/)
  assert.equal("storyboard" in OLD_SCENE, false)
  assert.equal(OLD_SCENE.zoom_direction, "in")
  assert.equal(OLD_SCENE.tempo, "fast")
  assert.equal(OLD_SCENE.duration_sec, 5)
  assert.equal(OLD_SCENE.transition, "black_fade")
  assert.deepEqual(OLD_SCENE.characters, ["Elena"])
})

test("2. Storyboard V1 persists every V1 field", () => {
  const screenplay = {
    scenes: [
      { ...OLD_SCENE, scene: 1 },
      { ...OLD_SCENE, scene: 2 },
      { ...OLD_SCENE, scene: 3 },
      { ...SCENE4_ELENA_FIXTURE },
      { ...OLD_SCENE, scene: 5 },
      { ...OLD_SCENE, scene: 6 },
    ],
  }
  const stored = getSceneStoryboard(screenplay.scenes[3])
  for (const field of STORYBOARD_V1_FIELDS) {
    assert.ok(field in stored, `missing ${field}`)
  }
  assert.deepEqual(stored.characterIds, [7])
  assert.equal(stored.location, "elena_apartment")
  assert.equal(stored.wardrobe["7"], "black wool coat")
  assert.equal(stored.action, "listens to the message for the second time")
  assert.equal(stored.emotion["7"], "contained fear")
  assert.equal(stored.shot, "close-up")
  assert.equal(stored.cameraMovement, "slow push-in")
  assert.equal(stored.lighting, "blue nighttime light")
  assert.equal(stored.props[0].key, "brother_phone")
  assert.ok(stored.continuity.includes("same_phone_as_scene_2"))
  assert.equal(kenBurnsZoomDirection(screenplay.scenes[3]), "in")
  assert.notEqual(stored.cameraMovement, screenplay.scenes[3].zoom_direction)
})

test("3. characterIds resolve Character by id, not only by name", () => {
  const renamed = { ...ELENA_CHARACTER_FIXTURE, name: "Not Elena" }
  const resolved = resolveCharactersForScene(SCENE4_ELENA_FIXTURE, [renamed])
  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].id, 7)
  assert.equal(resolveCharacterById([renamed], 7).id, 7)
  const byNameOnly = resolveCharactersForScene(OLD_SCENE, [ELENA_CHARACTER_FIXTURE])
  assert.equal(byNameOnly[0].id, 7)
})

test("4. private canonical path is refused; signed URL is Fal image_url", () => {
  const plannedPrompt = buildSceneVisualPrompt({
    scene: SCENE4_ELENA_FIXTURE,
    characters: [ELENA_CHARACTER_FIXTURE],
    series: SERIES,
  })
  assert.equal(plannedPrompt.referenceImageUrl, "characters/2/7/canonical.png")
  assert.doesNotMatch(plannedPrompt.prompt, /must exactly match/)
  assert.throws(
    () => buildFalStillRequest({
      prompt: plannedPrompt.prompt,
      referenceImageUrl: plannedPrompt.referenceImageUrl,
      aspectRatio: "9:16",
    }),
    (err) => err.code === "REFERENCE_AWARE_FAILED" && /private storage path/.test(err.message),
  )
  const signed = "https://signed.example/images/characters/2/7/canonical.png?token=tmp"
  const fal = buildFalStillRequest({
    prompt: plannedPrompt.prompt,
    referenceImageUrl: signed,
    aspectRatio: "9:16",
  })
  assert.equal(fal.route, STILL_ROUTE_REFERENCE)
  assert.equal(fal.body.image_url, signed)
  assert.equal(fal.body.prompt, plannedPrompt.prompt)
  assert.match(fal.url, /flux-pro\/kontext$/)
  assert.doesNotMatch(fal.url, /image-to-image/)
  const gemini = buildGeminiStillContents({
    prompt: plannedPrompt.prompt,
    referenceImageUrl: signed,
  })
  const uri = gemini.contents[0].parts[0].fileData.fileUri
  assert.equal(uri, signed)
})

test("5. scene wardrobe overrides wardrobeDefault only for that scene", () => {
  const board = getSceneStoryboard(SCENE4_ELENA_FIXTURE)
  assert.equal(sceneWardrobeForCharacter(ELENA_CHARACTER_FIXTURE, board), "black wool coat")
  assert.equal(ELENA_CHARACTER_FIXTURE.appearance.wardrobeDefault, "cream knit sweater")
  const prompt = buildSceneVisualPromptText({
    scene: SCENE4_ELENA_FIXTURE,
    characters: [ELENA_CHARACTER_FIXTURE],
    series: SERIES,
  })
  assert.match(prompt, /black wool coat/)
  assert.doesNotMatch(prompt, /cream knit sweater/)
})

test("6. props reach the prompt builder", () => {
  const prompt = buildSceneVisualPromptText({
    scene: SCENE4_ELENA_FIXTURE,
    characters: [ELENA_CHARACTER_FIXTURE],
    series: SERIES,
  })
  assert.match(prompt, /PROPS:/)
  assert.match(prompt, /brother_phone/)
  assert.match(prompt, /cracked-screen/)
})

test("7. location resolves from Series Bible", () => {
  const loc = resolveStoryboardLocation("elena_apartment", ELENA_SERIES_BIBLE_FIXTURE)
  assert.equal(loc.resolved, true)
  assert.match(loc.description, /blue window light/)
  const prompt = buildSceneVisualPromptText({
    scene: SCENE4_ELENA_FIXTURE,
    characters: [ELENA_CHARACTER_FIXTURE],
    series: SERIES,
  })
  assert.match(prompt, /LUGAR:/)
  assert.match(prompt, /Elena apartment/)
  assert.match(prompt, /blue window light/)
})

test("8. Scene 4 regenerates without modifying the other five scenes", () => {
  const scenes = [
    { ...OLD_SCENE, scene: 1 },
    { ...OLD_SCENE, scene: 2 },
    { ...OLD_SCENE, scene: 3 },
    { ...SCENE4_ELENA_FIXTURE },
    { ...OLD_SCENE, scene: 5 },
    { ...OLD_SCENE, scene: 6 },
  ]
  const existing = new Set([0, 1, 2, 3, 4, 5])
  const queue = selectScenesToGenerate(scenes, existing, { sceneIndex: 3 })
  assert.deepEqual(queue.map((q) => q.index), [3])
  const screenplay = { scenes }
  const patched = patchSceneStoryboard(screenplay, 3, { shot: "close-up" })
  assert.equal(patched.scenes[0], scenes[0])
  assert.equal(patched.scenes[1], scenes[1])
  assert.equal(patched.scenes[2], scenes[2])
  assert.equal(patched.scenes[4], scenes[4])
  assert.equal(patched.scenes[5], scenes[5])
  assert.notEqual(patched.scenes[3], scenes[3])
  assert.equal(patched.scenes[3].storyboard.shot, "close-up")
})

test("9. Episode 2 reuses the same Character.id + referenceImageUrl", () => {
  const seriesCharacters = [ELENA_CHARACTER_FIXTURE]
  const ep1 = resolveSeriesCharacterIdentity(seriesCharacters, 7)
  const ep2 = resolveSeriesCharacterIdentity(seriesCharacters, 7)
  assert.equal(ep1.characterId, 7)
  assert.equal(ep2.characterId, ep1.characterId)
  assert.equal(ep2.referenceImageUrl, ep1.referenceImageUrl)
  assert.equal(ep1.visualIdentity, "LOCKED")
  assert.equal(ep2.visualIdentity, "LOCKED")
})

test("10. without referenceImageUrl the text-only route still works", () => {
  const planned = buildSceneVisualPrompt({
    scene: SCENE4_ELENA_FIXTURE,
    characters: [unlockedElena()],
    series: SERIES,
  })
  assert.equal(planned.referenceImageUrl, null)
  assert.equal(planned.route, STILL_ROUTE_TEXT)
  assert.equal(selectStillRoute(planned), STILL_ROUTE_TEXT)
  assert.match(planned.prompt, /Latina woman/)
  const fal = buildFalStillRequest({ prompt: planned.prompt, referenceImageUrl: planned.referenceImageUrl })
  assert.equal(fal.body.image_url, undefined)
  assert.match(fal.url, /flux\/dev$/)
})

test("11. with referenceImageUrl the reference-aware route is selected", () => {
  const planned = buildSceneVisualPrompt({
    scene: SCENE4_ELENA_FIXTURE,
    characters: [ELENA_CHARACTER_FIXTURE],
    series: SERIES,
  })
  assert.equal(selectStillRoute(planned), STILL_ROUTE_REFERENCE)
  assert.equal(planned.visualIdentity, "LOCKED")
  assert.equal(primarySceneReferenceUrl([ELENA_CHARACTER_FIXTURE]), "characters/2/7/canonical.png")
  assert.equal(visualIdentityStatus(ELENA_CHARACTER_FIXTURE), "LOCKED")
  assert.equal(visualIdentityStatus(unlockedElena()), "NOT LOCKED")
})

test("12. reference-aware failure does not silently fall back to text-only", async () => {
  let textOnlyCalls = 0
  let referenceCalls = 0
  const fetchFn = async (url) => {
    if (String(url).includes("billing") || String(url).includes("platform/account")) {
      return new Response(JSON.stringify({ remaining_credit: 9 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (String(url).includes("flux-pro/kontext")) {
      referenceCalls += 1
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 })
    }
    if (String(url).includes("flux/dev")) {
      textOnlyCalls += 1
      return new Response(JSON.stringify({ images: [{ url: "https://cdn.example/x.png" }] }), { status: 200 })
    }
    return new Response("{}", { status: 404 })
  }
  await assert.rejects(
    () => generateFalStill(
      { prompt: "scene 4", referenceImageUrl: "https://signed.example/elena.png?token=tmp" },
      { FAL_KEY: "x", FAL_ALLOW_GENERATE: "1" },
      fetchFn,
    ),
    (err) => err.code === "REFERENCE_AWARE_FAILED" && /REFERENCE_AWARE_FAILED/.test(err.message),
  )
  assert.equal(referenceCalls, 1)
  assert.equal(textOnlyCalls, 0)
})

test("canonical reference copies into durable character storage path", async () => {
  const uploads = []
  const path = await persistCanonicalReference({
    seriesId: 2,
    characterId: 7,
    imageUrl: "data:image/png;base64,aGVsbG8=",
    uploadFn: async (bucket, storagePath, buffer, contentType) => {
      uploads.push({ bucket, storagePath, bytes: buffer.length, contentType })
    },
  })
  assert.equal(path, characterCanonicalPath(2, 7))
  assert.equal(path, "characters/2/7/canonical.png")
  assert.equal(uploads[0].storagePath, path)
})

test("reference pack V1 exposes canonicalFace only", () => {
  const pack = characterReferencePack(ELENA_CHARACTER_FIXTURE)
  assert.equal(pack.canonicalFace, ELENA_CHARACTER_FIXTURE.referenceImageUrl)
  assert.equal(pack.bodyReference, null)
  assert.equal(pack.wardrobeReference, null)
  assert.deepEqual(pack.expressionReferences, [])
})

test("empty storyboard defaults are stable", () => {
  assert.deepEqual(normalizeStoryboard(null).characterIds, [])
  assert.deepEqual(emptyStoryboard().props, [])
})
