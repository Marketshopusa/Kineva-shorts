import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  renderPath,
  renderCandidates,
  RENDERS_BUCKET,
  motionRenderPath,
  legacyAnimaticPath,
  clipPath,
  isAllowedRenderObjectPath,
} from "../../lib/supabase-storage.js"
import { classifyRenderVersion } from "../../lib/video-clip-storage.js"
import { persistStoryboardV1OnScreenplay } from "../../lib/derive-storyboard.js"
import {
  mapCharacterElements,
  orderCharactersForElements,
  resolveVideoElementsForProvider,
  publicVideoElements,
  falElementsFromResolved,
  isMateoCharacter,
} from "../../lib/video-elements.js"
import {
  planEpisodeMotionShots,
  assertNoSplitScreenPrompt,
  splitScreenForbiddenClause,
  motionValidationReport,
  shotAllowsStartFrame,
  shouldApplyLipsync,
} from "../../lib/video-shot-plan.js"
import {
  KLING_O1_USD_PER_SECOND,
  klingCostUsd,
  assertCostWithinCap,
  buildKlingO1Body,
} from "../../lib/providers/video/kling.js"

const ELENA = {
  id: 2,
  seriesId: 2,
  name: "Elena Varela",
  referenceImageUrl: "characters/2/2/canonical.png",
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
  referenceImageUrl: "characters/2/4/canonical.jpg",
}

const EP1_SCENES = [
  { scene: 1, type: "HOOK", characters: ["Elena Varela"], visual_description: "Un smartphone oscuro sobre una mesa de madera gastada en el departamento de Elena.", duration_sec: 8, text_es: "El silencio se rompió." },
  { scene: 2, type: "SETUP", characters: ["Elena Varela", "Mateo Varela"], visual_description: "Elena, de pie en la sala estrecha de su departamento.", duration_sec: 12, text_es: "Su nombre." },
  { scene: 3, type: "CLUE", characters: ["Elena Varela", "Mateo Varela"], visual_description: "Elena se sienta en el borde del sofá gastado.", duration_sec: 13, text_es: "Si estás escuchando esto." },
  { scene: 4, type: "BREAKING_POINT", characters: ["Elena Varela", "Mateo Varela"], visual_description: "Elena está acurrucada en el sofá.", duration_sec: 15, text_es: "Recuerdas la azotea." },
  { scene: 5, type: "CONFRONTATION", characters: ["Elena Varela", "Iván Cruz"], visual_description: "Elena, descalza y con el cabello revuelto, en el umbral de la puerta de Iván. Iván le ofrece una taza de café.", duration_sec: 12, text_es: "Tocó la puerta del cinco." },
  { scene: 6, type: "CLIFFHANGER", characters: ["Elena Varela", "Iván Cruz", "Mateo Varela"], visual_description: "Close-up en el teléfono en la mano de Elena. Iván está escuchando atentamente.", duration_sec: 10, text_es: "Hay algo que tienes que encontrar." },
]

function screenplay() {
  return persistStoryboardV1OnScreenplay(
    { scenes: EP1_SCENES.map((scene) => ({ ...scene })) },
    [ELENA, MATEO, IVAN],
    { seriesId: 2, episodeNumber: 1, series: { id: 2, title: "LA ÚLTIMA LLAMADA" } },
  )
}

test("legacy animatic path stays episode-1.mp4 and is not the motion file", () => {
  assert.equal(RENDERS_BUCKET, "renders")
  assert.equal(renderPath(2, 2), "series/2/episodes/2/episode-1.mp4")
  assert.equal(legacyAnimaticPath(2, 2), "series/2/episodes/2/episode-1.mp4")
  assert.equal(motionRenderPath(2, 2), "series/2/episodes/2/episode-1-motion-v1.mp4")
  assert.notEqual(motionRenderPath(2, 2), renderPath(2, 2))
})

test("Watch prefers motion V1 then isolates legacy animatic", () => {
  assert.deepEqual(renderCandidates(2, 2), [
    "series/2/episodes/2/episode-1-minimax-v1.mp4",
    "series/2/episodes/2/episode-1-motion-v1.mp4",
    "series/2/episodes/2/episode-1.mp4",
    "series/2/episodes/2/kineva-demo.mp4",
  ])
  assert.deepEqual(renderCandidates(2, 2, { version: "legacy" }), [
    "series/2/episodes/2/episode-1.mp4",
    "series/2/episodes/2/kineva-demo.mp4",
  ])
  assert.deepEqual(renderCandidates(2, 2, { version: "motion" }), [
    "series/2/episodes/2/episode-1-motion-v1.mp4",
  ])
  assert.equal(classifyRenderVersion(motionRenderPath(2, 2)), "motion")
  assert.equal(classifyRenderVersion(legacyAnimaticPath(2, 2)), "legacy")
})

test("clip persistence paths are durable under renders/", () => {
  assert.equal(clipPath(2, 2, "shot-01"), "series/2/episodes/2/clips/shot-01.mp4")
  assert.equal(isAllowedRenderObjectPath(2, 2, clipPath(2, 2, "shot-08")), true)
  assert.equal(isAllowedRenderObjectPath(2, 2, motionRenderPath(2, 2)), true)
  assert.equal(isAllowedRenderObjectPath(2, 2, legacyAnimaticPath(2, 2)), true)
  assert.equal(isAllowedRenderObjectPath(2, 2, "series/2/episodes/9/episode-1.mp4"), false)
  assert.equal(isAllowedRenderObjectPath(2, 2, "characters/2/2/canonical.png"), false)
})

test("canonical element mapping: Elena @Element1, Iván @Element2, Mateo never visual", () => {
  const mapped = mapCharacterElements([IVAN, ELENA, MATEO])
  assert.deepEqual(mapped.map((item) => item.tag), ["@Element1", "@Element2"])
  assert.equal(mapped[0].characterId, 2)
  assert.equal(mapped[0].role, "elena")
  assert.equal(mapped[1].characterId, 4)
  assert.equal(mapped[1].role, "ivan")
  assert.equal(mapped.some((item) => item.characterId === 3), false)
  assert.equal(isMateoCharacter(MATEO), true)
  const ordered = orderCharactersForElements([IVAN, ELENA])
  assert.equal(ordered[0].id, 2)
  assert.equal(ordered[1].id, 4)
})

test("signed canonicals are used for Fal elements and never treated as stored canonical", async () => {
  const signedElena = "https://signed.example/images/characters/2/2/canonical.png?token=tmp"
  const signedIvan = "https://signed.example/images/characters/2/4/canonical.jpg?token=tmp"
  const resolved = await resolveVideoElementsForProvider([ELENA, IVAN], {
    downloadStorage: async () => Buffer.from("img"),
    signUrl: async (bucket, path) => (path.endsWith(".png") ? signedElena : signedIvan),
  })
  assert.equal(resolved[0].storagePath, "characters/2/2/canonical.png")
  assert.equal(resolved[1].storagePath, "characters/2/4/canonical.jpg")
  assert.equal(resolved[0].providerUrl, signedElena)
  assert.notEqual(ELENA.referenceImageUrl, signedElena)
  const publicEls = publicVideoElements(resolved)
  assert.equal(publicEls[0].providerUrl, undefined)
  assert.equal(publicEls[0].storagePath, "characters/2/2/canonical.png")
  const fal = falElementsFromResolved(resolved)
  assert.deepEqual(fal, [
    { frontal_image_url: signedElena },
    { frontal_image_url: signedIvan },
  ])
})

test("Episode 1 motion shot plan is 8-12 clips, 55s+, MiniMax standard (no Fal video cost)", () => {
  const plan = planEpisodeMotionShots(screenplay(), [ELENA, MATEO, IVAN], {
    seriesId: 2,
    episodeNumber: 1,
  })
  assert.ok(plan.shotCount >= 8 && plan.shotCount <= 12)
  assert.ok(plan.totalDurationSec >= 55)
  assert.equal(plan.projectedUsd, 0)
  assert.equal(plan.model, "minimax_h3")
  assert.equal(plan.engine, "self_hosted_workflow")
  assert.ok(plan.shots[0].imagePrompt)
  assert.ok(plan.shots[0].motionPrompt)
  assert.notEqual(plan.shots[0].imagePrompt, plan.shots[0].motionPrompt)
  assert.match(plan.shots[0].motionPrompt, /FACIAL MOTION/)
  assert.match(plan.shots[0].motionPrompt, /CAMERA MOTION/)
  assert.equal(klingCostUsd(60), 6.72)
  assert.equal(assertCostWithinCap(6.72), 6.72)
  assert.throws(() => assertCostWithinCap(9.01), /VIDEO_COST_CAP/)
  const validation = motionValidationReport(plan)
  assert.equal(validation.pass, true)
})

test("scenes 5-6 share physical space and never emit split-screen prompts", () => {
  const plan = planEpisodeMotionShots(screenplay(), [ELENA, MATEO, IVAN], {
    seriesId: 2,
    episodeNumber: 1,
  })
  const shared = plan.shots.filter((shot) => shot.sceneIndex >= 4)
  assert.ok(shared.length >= 2)
  for (const shot of shared) {
    assert.deepEqual(shot.onScreenCharacterIds, [2, 4])
    if (shot.sceneIndex === 5) {
      assert.ok(shot.voiceOnlyCharacterIds.includes(3))
    } else {
      assert.equal(shot.voiceOnlyCharacterIds.includes(3), false)
    }
    assert.equal(shot.sharedSpace, true)
    assert.equal(shotAllowsStartFrame(shot.sceneIndex), false)
    assertNoSplitScreenPrompt(shot.videoPrompt)
    assert.match(shot.videoPrompt, /SAME (hallway|physical)|same room|shared physical/i)
    assert.doesNotMatch(shot.videoPrompt, /split[\s-]?screen|collage|diptych|side-by-side/i)
    assert.match(splitScreenForbiddenClause(), /one continuous camera frame/)
  }
  assert.throws(() => assertNoSplitScreenPrompt("Use a split-screen of Elena and Ivan"), /SPLIT_SCREEN_PROMPT_FORBIDDEN/)
})

test("Mateo stays voice-only and lipsync is off for voicemail shots", () => {
  const plan = planEpisodeMotionShots(screenplay(), [ELENA, MATEO, IVAN], {
    seriesId: 2,
    episodeNumber: 1,
  })
  for (const shot of plan.shots) {
    assert.equal(shot.characterElements.some((el) => el.characterId === 3), false)
    assert.doesNotMatch(shot.videoPrompt, /Mateo Varela walking|Mateo on screen|show Mateo walking/i)
    assert.equal(shouldApplyLipsync(shot), false)
    if (shot.sceneIndex >= 1 && shot.sceneIndex <= 3) {
      assert.ok(shot.voiceOnlyCharacterIds.includes(3))
    }
  }
})

test("Kling body uses elements not private paths", () => {
  const body = buildKlingO1Body({
    prompt: "Take @Element1 acting",
    elements: [{ frontal_image_url: "https://signed.example/elena.png" }],
    duration: 6,
    aspectRatio: "9:16",
  })
  assert.equal(body.duration, "6")
  assert.equal(body.aspect_ratio, "9:16")
  assert.equal(body.elements[0].frontal_image_url.startsWith("https://"), true)
  assert.equal(KLING_O1_USD_PER_SECOND, 0.112)
})

test("Remotion MotionVideo uses OffthreadVideo clips, DramaVideo remains Ken Burns legacy", async () => {
  const motion = await readFile(new URL("../../remotion/MotionVideo.js", import.meta.url), "utf8")
  const shot = await readFile(new URL("../../remotion/MotionShot.js", import.meta.url), "utf8")
  const drama = await readFile(new URL("../../remotion/DramaVideo.js", import.meta.url), "utf8")
  const scene = await readFile(new URL("../../remotion/Scene.js", import.meta.url), "utf8")
  const root = await readFile(new URL("../../remotion/index.js", import.meta.url), "utf8")
  assert.match(shot, /OffthreadVideo/)
  assert.doesNotMatch(shot, /Ken Burns|interpolate\(\s*frame/)
  assert.match(motion, /MotionShot/)
  assert.match(root, /id="MotionVideo"/)
  assert.match(root, /id="DramaVideo"/)
  assert.match(scene, /Ken Burns/)
  assert.match(drama, /Scene/)
})

test("final motion URL is episode-1-motion-v1.mp4", () => {
  assert.equal(motionRenderPath(2, 2), "series/2/episodes/2/episode-1-motion-v1.mp4")
})
