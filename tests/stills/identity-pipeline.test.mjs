import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveCharacterReferenceForProvider,
  isPrivateStoragePath,
} from "../../lib/character-reference-provider.js"
import { persistStoryboardV1OnScreenplay } from "../../lib/derive-storyboard.js"
import { buildSceneVisualPrompt } from "../../lib/buildSceneVisualPrompt.js"
import {
  IDENTITY_STILL_REQUIRES_FAL,
  REQUIRED_VISUAL_CHARACTER_NOT_LOCKED,
  planSceneStill,
  planEpisodeStills,
  runStillGenerationIfReady,
} from "../../lib/still-plan.js"
import {
  assertIdentityStillSpendGate,
  falModelIdFromUrl,
  preflightSceneStillGeneration,
  resolveStillInputForProvider,
} from "../../lib/still-preflight.js"
import { stillPersistTargetFromDataUrl } from "../../lib/still-persist.js"
import { imagePath } from "../../lib/supabase-storage.js"
import { selectScenesToGenerate } from "../../lib/storyboard.js"
import {
  STILL_ROUTE_MULTI_REFERENCE,
  STILL_ROUTE_SINGLE_REFERENCE,
  buildFalStillRequest,
  FAL_KONTEXT_MODEL,
  FAL_KONTEXT_MULTI_MODEL,
} from "../../lib/providers/images/still-request.js"
import { generateFalStill } from "../../lib/providers/images/fal.js"
import { runProviderAfterImagesBucketReady } from "../../lib/storage-preflight.js"

const ELENA = {
  id: 2,
  seriesId: 2,
  name: "Elena Varela",
  referenceImageUrl: "characters/2/2/canonical.png",
  appearance: { wardrobeDefault: "cream knit sweater" },
}
const MATEO = {
  id: 3,
  seriesId: 2,
  name: "Mateo Varela",
  referenceImageUrl: null,
}
const IVAN = {
  id: 4,
  seriesId: 2,
  name: "Iván Cruz",
  referenceImageUrl: null,
}
const IVAN_LOCKED = {
  ...IVAN,
  referenceImageUrl: "characters/2/4/canonical.png",
}

const EP1_SCENES = [
  {
    scene: 1,
    type: "HOOK",
    characters: ["Elena Varela"],
    visual_description: "Un smartphone oscuro sobre una mesa de madera gastada en el departamento de Elena. La pantalla se ilumina de golpe.",
    zoom_direction: "in",
    tempo: "fast",
    duration_sec: 8,
    transition: "black_fade",
  },
  {
    scene: 2,
    type: "SETUP",
    characters: ["Elena Varela", "Mateo Varela"],
    visual_description: "Elena, de pie en la sala estrecha de su departamento. La luz tenue del teléfono ilumina su rostro pálido. Lleva ropa de casa, el cabello suelto. El vaso de agua cae en el fregadero.",
    zoom_direction: "out",
    tempo: "normal",
    duration_sec: 12,
    transition: "black_fade",
    text_es: "Solo su eco. Una grabación programada.",
  },
  {
    scene: 3,
    type: "CLUE",
    characters: ["Elena Varela", "Mateo Varela"],
    visual_description: "Elena se sienta en el borde del sofá gastado. La lámpara cálida de pie detrás de ella crea sombras largas.",
    zoom_direction: "in",
    tempo: "normal",
    duration_sec: 13,
    transition: "black_fade",
  },
  {
    scene: 4,
    type: "BREAKING_POINT",
    characters: ["Elena Varela", "Mateo Varela"],
    visual_description: "Elena está acurrucada en el sofá, abrazando sus rodillas. El teléfono contra su mejilla.",
    zoom_direction: "in",
    tempo: "slow",
    duration_sec: 15,
    transition: "black_fade",
  },
  {
    scene: 5,
    type: "CONFRONTATION",
    characters: ["Elena Varela", "Iván Cruz"],
    visual_description: "Elena, descalza y con el cabello revuelto, en el umbral de la puerta de Iván. Iván le ofrece una taza de café.",
    zoom_direction: "out",
    tempo: "normal",
    duration_sec: 12,
    transition: "black_fade",
  },
  {
    scene: 6,
    type: "CLIFFHANGER",
    characters: ["Elena Varela", "Iván Cruz", "Mateo Varela"],
    visual_description: "Close-up en el teléfono en la mano de Elena. Iván está escuchando atentamente. Elena lo mira fijamente.",
    zoom_direction: "in",
    tempo: "fast",
    duration_sec: 10,
    transition: "black_fade",
  },
]

const SERIES = { id: 2, title: "LA ÚLTIMA LLAMADA", visualStyle: "cinematic" }

function persisted(characters = [ELENA, MATEO, IVAN]) {
  return persistStoryboardV1OnScreenplay(
    { scenes: EP1_SCENES.map((scene) => ({ ...scene })) },
    characters,
    { seriesId: 2, episodeNumber: 1, series: SERIES },
  )
}

function signed(path) {
  return `https://signed.example/storage/v1/object/sign/images/${path}?token=tmp`
}

test("1. private canonical path is not sent raw to Fal", () => {
  const path = "characters/2/2/canonical.png"
  assert.equal(isPrivateStoragePath(path), true)
  assert.throws(
    () => buildFalStillRequest({ prompt: "scene 1", referenceImageUrl: path, aspectRatio: "9:16" }),
    (err) => err.code === "REFERENCE_AWARE_FAILED" && /private storage path/.test(err.message),
  )
})

test("2. signed/resolved reference reaches the provider as image_url", async () => {
  const character = { ...ELENA }
  const resolved = await resolveCharacterReferenceForProvider(character, {
    downloadStorage: async () => Buffer.from("png"),
    signUrl: async () => signed(ELENA.referenceImageUrl),
  })
  const fal = buildFalStillRequest({
    prompt: "scene 1",
    referenceImageUrl: resolved.providerUrl,
    aspectRatio: "9:16",
  })
  assert.equal(fal.route, STILL_ROUTE_SINGLE_REFERENCE)
  assert.equal(fal.url, FAL_KONTEXT_MODEL)
  assert.equal(fal.body.image_url, signed(ELENA.referenceImageUrl))
  assert.equal(fal.body.image_url.startsWith("https://"), true)
  assert.doesNotMatch(fal.body.image_url, /^characters\//)
})

test("3. signed URL is not persisted as canonical", async () => {
  const character = { ...ELENA }
  const original = character.referenceImageUrl
  const resolved = await resolveCharacterReferenceForProvider(character, {
    downloadStorage: async () => Buffer.from("png"),
    signUrl: async () => signed(ELENA.referenceImageUrl),
  })
  assert.equal(character.referenceImageUrl, original)
  assert.equal(character.referenceImageUrl, "characters/2/2/canonical.png")
  assert.notEqual(resolved.providerUrl, character.referenceImageUrl)
  assert.match(resolved.providerUrl, /^https:\/\//)
})

test("4. voice-only character is not a still reference", () => {
  const screenplay = persisted()
  const scene2 = screenplay.scenes[1]
  const plan = planSceneStill(scene2, [ELENA, MATEO, IVAN])
  assert.deepEqual(plan.onScreen.map((c) => c.id), [2])
  assert.deepEqual(plan.voiceOnly.map((c) => c.id), [3])
  assert.deepEqual(plan.references.map((r) => r.characterId), [2])
  assert.equal(plan.references.some((r) => r.characterId === 3), false)
})

test("5. Scene 1 uses Elena only", () => {
  const scene1 = persisted().scenes[0]
  const planned = buildSceneVisualPrompt({ scene: scene1, characters: [ELENA, MATEO, IVAN], series: SERIES })
  assert.deepEqual(planned.onScreenCharacterIds, [2])
  assert.deepEqual(planned.voiceOnlyCharacterIds, [])
  assert.deepEqual(planned.references.map((r) => r.characterId), [2])
  assert.equal(planned.providerRoute, "SINGLE_REFERENCE")
  assert.equal(planned.ready, true)
  assert.match(planned.prompt, /Elena Varela/)
  assert.doesNotMatch(planned.prompt, /Mateo/)
  assert.doesNotMatch(planned.prompt, /Iván|Ivan/)
})

test("6. Scene 2 does not try to draw Mateo", () => {
  const scene2 = persisted().scenes[1]
  const planned = buildSceneVisualPrompt({ scene: scene2, characters: [ELENA, MATEO, IVAN], series: SERIES })
  assert.deepEqual(planned.onScreenCharacterIds, [2])
  assert.deepEqual(planned.voiceOnlyCharacterIds, [3])
  assert.match(planned.prompt, /VOICE-ONLY/)
  assert.match(planned.prompt, /Do not draw this person on screen/)
  assert.equal(planned.references.some((r) => /mateo/i.test(r.name)), false)
  assert.equal(planned.ready, true)
})

test("7. Scene 5 uses Elena + Iván", () => {
  const scene5 = persisted([ELENA, MATEO, IVAN_LOCKED]).scenes[4]
  const plan = planSceneStill(scene5, [ELENA, MATEO, IVAN_LOCKED])
  assert.deepEqual(plan.onScreen.map((c) => c.id).sort(), [2, 4])
  assert.deepEqual(plan.voiceOnly, [])
  assert.deepEqual(plan.references.map((r) => r.characterId), [2, 4])
  assert.equal(plan.references[0].name, "Elena Varela")
  assert.equal(plan.references[1].name, "Iván Cruz")
})

test("8. multi-character scene selects MULTI_REFERENCE", () => {
  const scene5 = persisted([ELENA, MATEO, IVAN_LOCKED]).scenes[4]
  const plan = planSceneStill(scene5, [ELENA, MATEO, IVAN_LOCKED])
  assert.equal(plan.providerRoute, "MULTI_REFERENCE")
  assert.equal(plan.stillRoute, STILL_ROUTE_MULTI_REFERENCE)
  const fal = buildFalStillRequest({
    prompt: "scene 5",
    referenceImageUrls: [signed(ELENA.referenceImageUrl), signed(IVAN_LOCKED.referenceImageUrl)],
    aspectRatio: "9:16",
  })
  assert.equal(fal.route, STILL_ROUTE_MULTI_REFERENCE)
  assert.equal(fal.url, FAL_KONTEXT_MULTI_MODEL)
  assert.deepEqual(fal.body.image_urls, [
    signed(ELENA.referenceImageUrl),
    signed(IVAN_LOCKED.referenceImageUrl),
  ])
  assert.equal(fal.body.image_url, undefined)
})

test("9. Iván NOT LOCKED blocks Scene 5–6 before spend", async () => {
  const screenplay = persisted()
  const plans = planEpisodeStills(screenplay, [ELENA, MATEO, IVAN])
  assert.equal(plans[4].ready, false)
  assert.equal(plans[5].ready, false)
  assert.equal(plans[4].providerRoute, "MULTI_REFERENCE")
  assert.equal(plans[5].providerRoute, "MULTI_REFERENCE")
  assert.match(plans[4].blockReason, new RegExp(REQUIRED_VISUAL_CHARACTER_NOT_LOCKED))
  assert.match(plans[5].blockReason, /Iván|Ivan/)
  let spent = 0
  await assert.rejects(
    () => runStillGenerationIfReady(plans[4], async () => {
      spent += 1
      return "generated"
    }),
    (err) => err.code === REQUIRED_VISUAL_CHARACTER_NOT_LOCKED,
  )
  assert.equal(spent, 0)
})

test("10. Mateo NOT LOCKED does not block Episode 1", () => {
  const plans = planEpisodeStills(persisted(), [ELENA, MATEO, IVAN])
  assert.equal(plans[0].ready, true)
  assert.equal(plans[1].ready, true)
  assert.equal(plans[2].ready, true)
  assert.equal(plans[3].ready, true)
  assert.equal(plans[1].voiceOnly[0].id, 3)
  assert.equal(plans[1].blockReason, null)
  assert.equal(MATEO.referenceImageUrl, null)
})

test("11. missing storage/ref blocks provider before generate", async () => {
  let generateCalls = 0
  await assert.rejects(
    () => runProviderAfterImagesBucketReady(
      async () => {
        generateCalls += 1
        return "spent"
      },
      { listFn: async () => [{ name: "dubs", public: false }] },
    ),
    /IMAGES_BUCKET not ready/,
  )
  assert.equal(generateCalls, 0)

  await assert.rejects(
    () => resolveCharacterReferenceForProvider(ELENA, {
      downloadStorage: async () => {
        throw new Error("Object not found")
      },
      signUrl: async () => signed(ELENA.referenceImageUrl),
    }),
    /Object not found/,
  )

  const scene1 = persisted().scenes[0]
  await assert.rejects(
    () => preflightSceneStillGeneration({
      scene: scene1,
      characters: [ELENA, MATEO, IVAN],
      assertStorageReady: async () => ({ ready: true }),
      resolveCharacter: async () => {
        throw new Error("canonical missing")
      },
    }),
    (err) => err.code === "CANONICAL_REFERENCE_UNRESOLVED",
  )
  assert.equal(generateCalls, 0)
})

test("12. no silent fallback from multi-reference to single or text-only", async () => {
  let textCalls = 0
  let singleCalls = 0
  let multiCalls = 0
  const fetchFn = async (url) => {
    const href = String(url)
    if (href.includes("billing") || href.includes("platform/account")) {
      return new Response(JSON.stringify({ remaining_credit: 9 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (href.includes("flux-pro/kontext/multi")) {
      multiCalls += 1
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 })
    }
    if (href.includes("flux-pro/kontext")) {
      singleCalls += 1
      return new Response(JSON.stringify({ images: [{ url: "https://cdn.example/one.png" }] }), { status: 200 })
    }
    if (href.includes("flux/dev")) {
      textCalls += 1
      return new Response(JSON.stringify({ images: [{ url: "https://cdn.example/text.png" }] }), { status: 200 })
    }
    return new Response("{}", { status: 404 })
  }
  await assert.rejects(
    () => generateFalStill(
      {
        prompt: "scene 5",
        referenceImageUrls: [signed(ELENA.referenceImageUrl), signed(IVAN_LOCKED.referenceImageUrl)],
        aspectRatio: "9:16",
      },
      { FAL_KEY: "x", FAL_ALLOW_GENERATE: "1" },
      fetchFn,
    ),
    (err) => err.code === "REFERENCE_AWARE_FAILED",
  )
  assert.equal(multiCalls, 1)
  assert.equal(singleCalls, 0)
  assert.equal(textCalls, 0)
})

test("Episode 1 storyboard V1 keeps legacy scene fields and classifies Mateo as voice-only", () => {
  const screenplay = persisted()
  for (const scene of screenplay.scenes) {
    assert.ok(Array.isArray(scene.storyboard.characterIds))
    assert.ok(Array.isArray(scene.storyboard.onScreenCharacterIds))
    assert.ok(Array.isArray(scene.storyboard.voiceOnlyCharacterIds))
    assert.equal("visual_description" in scene, true)
    assert.equal("characters" in scene, true)
    assert.equal("zoom_direction" in scene, true)
    assert.equal("tempo" in scene, true)
    assert.equal("duration_sec" in scene, true)
    assert.equal("transition" in scene, true)
    assert.ok(scene.storyboard.visualPrompt)
  }
  assert.deepEqual(screenplay.scenes[0].storyboard.onScreenCharacterIds, [2])
  assert.deepEqual(screenplay.scenes[1].storyboard.voiceOnlyCharacterIds, [3])
  assert.deepEqual(screenplay.scenes[4].storyboard.onScreenCharacterIds, [2, 4])
  assert.deepEqual(screenplay.scenes[5].storyboard.characterIds, [2, 4, 3])
  assert.deepEqual(screenplay.scenes[5].storyboard.onScreenCharacterIds, [2, 4])
  assert.deepEqual(screenplay.scenes[5].storyboard.voiceOnlyCharacterIds, [3])
})

test("resolveStillInputForProvider signs private paths and leaves Character untouched", async () => {
  const character = { ...ELENA }
  const resolved = await resolveStillInputForProvider(
    { prompt: "x", referenceImageUrls: [character.referenceImageUrl] },
    {
      resolvePath: async (storagePath) => ({
        storagePath,
        providerUrl: signed(storagePath),
        durablePath: storagePath,
      }),
    },
  )
  assert.equal(character.referenceImageUrl, "characters/2/2/canonical.png")
  assert.equal(resolved.referenceImageUrls[0], signed(ELENA.referenceImageUrl))
  assert.equal(resolved.referenceImageUrl.startsWith("https://"), true)
})

test("Scene 1 queue is only sceneIndex 0", () => {
  const scenes = persisted().scenes
  const queue = selectScenesToGenerate(scenes, new Set(), { sceneIndex: 0 })
  assert.deepEqual(queue.map((item) => item.index), [0])
  assert.equal(queue.length, 1)
  assert.equal(scenes.length, 6)
})

test("Scene 1 spend gate requires Fal kontext", () => {
  const scene1 = persisted().scenes[0]
  const plan = planSceneStill(scene1, [ELENA, MATEO, IVAN])
  const input = {
    prompt: scene1.storyboard.visualPrompt,
    referenceImageUrl: signed(ELENA.referenceImageUrl),
    aspectRatio: "9:16",
  }
  const gate = assertIdentityStillSpendGate({
    rail: { imageProvider: "fal" },
    plan,
    resolvedInput: input,
  })
  assert.equal(plan.providerRoute, "SINGLE_REFERENCE")
  assert.equal(gate.model, "fal-ai/flux-pro/kontext")
  assert.equal(falModelIdFromUrl(FAL_KONTEXT_MODEL), "fal-ai/flux-pro/kontext")
  assert.throws(
    () => assertIdentityStillSpendGate({
      rail: { imageProvider: "gemini" },
      plan,
      resolvedInput: input,
    }),
    (err) => err.code === IDENTITY_STILL_REQUIRES_FAL,
  )
})

test("persisted Scene 1 visualPrompt is used, not a rewritten plot", () => {
  const base = persisted().scenes[0]
  const scene = {
    ...base,
    storyboard: {
      ...base.storyboard,
      visualPrompt: "PERSISTED SCENE 1: Elena Varela only, smartphone on worn wood table.",
    },
  }
  const planned = buildSceneVisualPrompt({ scene, characters: [ELENA, MATEO, IVAN], series: SERIES })
  assert.match(planned.prompt, /PERSISTED SCENE 1/)
  assert.match(planned.prompt, /exact facial identity/)
  assert.doesNotMatch(planned.prompt, /Mateo/)
})

test("still persist sniffs JPEG vs PNG and matches extension", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const jpegTarget = stillPersistTargetFromDataUrl(2, 0, `data:image/jpeg;base64,${jpeg.toString("base64")}`, 99)
  const pngTarget = stillPersistTargetFromDataUrl(2, 0, `data:image/png;base64,${png.toString("base64")}`, 100)
  assert.equal(jpegTarget.contentType, "image/jpeg")
  assert.equal(jpegTarget.extension, "jpg")
  assert.equal(jpegTarget.storagePath, "episodes/2/0_99.jpg")
  assert.equal(pngTarget.contentType, "image/png")
  assert.equal(pngTarget.storagePath, "episodes/2/0_100.png")
  assert.equal(imagePath(2, 0, 101, "jpg"), "episodes/2/0_101.jpg")
  assert.equal(jpegTarget.aspectRatio, "9:16")
  assert.equal(jpegTarget.width, 1080)
  assert.equal(jpegTarget.height, 1920)
})
