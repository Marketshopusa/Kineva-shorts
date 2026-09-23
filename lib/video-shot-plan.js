import { getSceneStoryboard } from "./storyboard.js"
import { sceneVideoPresence } from "./video-elements.js"
import { resolveClipEngine } from "./video-engine.js"
import {
  DEFAULT_SHOT_DURATION_SEC,
  KLING_O1_USD_PER_SECOND,
  MOTION_V1_HARD_CAP_USD,
  MOTION_V1_MAX_DURATION_SEC,
  MOTION_V1_MAX_SHOTS,
  MOTION_V1_MIN_DURATION_SEC,
  MOTION_V1_MIN_SHOTS,
  assertCostWithinCap,
  klingCostUsd,
  roundUsd,
} from "./providers/video/kling.js"

export const SPLIT_SCREEN_FORBIDDEN = Object.freeze([
  "split screen",
  "split-screen",
  "splitscreen",
  "collage",
  "diptych",
  "side-by-side",
  "side by side",
  "two panels",
  "two-panel",
  "dual portrait",
  "portrait panels",
])

const SPLIT_SCREEN_RE = /split[\s-]?screen|collage|diptych|side[\s-]?by[\s-]?side|two[\s-]?panels?|dual portrait|portrait panels/i

export function splitScreenForbiddenClause() {
  return "Keep every character inside one continuous camera frame. Do not divide the image into separate portraits or panels."
}

export function assertNoSplitScreenPrompt(prompt) {
  const text = String(prompt || "")
  if (SPLIT_SCREEN_RE.test(text)) {
    const err = new Error("SPLIT_SCREEN_PROMPT_FORBIDDEN")
    err.code = "SPLIT_SCREEN_PROMPT_FORBIDDEN"
    throw err
  }
  return text
}

export function shotAllowsStartFrame(sceneIndex) {
  return Number(sceneIndex) <= 3
}

function padShotId(index) {
  return `shot-${String(index + 1).padStart(2, "0")}`
}

function elementPromptPrefix(elements) {
  const tags = (elements || []).map((el) => {
    if (el.role === "elena") return `${el.tag} is Elena Varela, keep her exact face, hair, eye color, and age from the reference`
    if (el.role === "ivan") return `${el.tag} is Iván Cruz, keep his exact face, hair, and identity from the reference`
    return `${el.tag} is ${el.name}`
  })
  return tags.join(". ")
}

function motionIdentityLock(elements) {
  const hasIvan = (elements || []).some((el) => el.role === "ivan")
  const hasElena = (elements || []).some((el) => el.role === "elena")
  const bits = [
    "Photoreal cinematic vertical 9:16, handheld 35mm, night interior, natural body motion, hair and clothing moving, facial micro-expressions, hands acting with props.",
    "Do not freeze into a photograph. Characters must act: breathe, shift weight, turn their heads, use their hands.",
    splitScreenForbiddenClause(),
    "Mateo remains off-camera and voice-only. Never show him as a person in frame.",
  ]
  if (hasElena && hasIvan) {
    bits.push("Elena and Iván occupy the SAME hallway and apartment threshold at the same time and can interact physically. Not two portraits.")
  }
  return bits.join(" ")
}

const EP1_SHOT_SPECS = [
  {
    sceneIndex: 0,
    action: "Elena's trembling hand reaches across the worn kitchen table toward a dark smartphone that suddenly lights up with an unknown incoming call.",
    facialPerformance: "Her face enters frame as she leans in; eyes widen from distraction into alert concern as she reads the unknown number.",
    bodyPerformance: "Fingers hesitate over the vibrating phone, hover, then slowly close around it. Shoulders tighten. She takes a shallow breath.",
    cameraAction: "Slow cinematic push-in from the tabletop toward her face, subtle handheld drift.",
    environmentMotion: "Phone screen bloom pulses on the wood grain. Night kitchen practicals flicker slightly. Dust motes in the phone light.",
    narration: "El silencio se rompió. No era el timbre de siempre. Uno antiguo. Oxidado.",
    lipsync: false,
  },
  {
    sceneIndex: 0,
    action: "Elena lifts the phone off the table, turns it toward herself, and glances from the unknown caller ID toward the dark hallway.",
    facialPerformance: "Expression shifts from confusion to dread. Jaw tightens. A swallow. Eyes flick toward the hallway then back to the screen.",
    bodyPerformance: "She stands slightly from the chair, hair sliding over her shoulder as she turns her head. Thumb hovers over answer.",
    cameraAction: "Handheld follow as she rises, then a short pan toward the dark hallway and back.",
    environmentMotion: "Curtain breathes at the window. Refrigerator hum implied. Phone vibration rattles a spoon.",
    narration: "Un eco de otra vida. La hora incorrecta.",
    lipsync: false,
  },
  {
    sceneIndex: 1,
    action: "Elena stands in her narrow living room holding the phone to her ear as a voicemail begins. A glass of water slips from her other hand into the sink.",
    facialPerformance: "Phone light under-lights her pale face. Recognition then shock. Lips part. She does not speak; she listens.",
    bodyPerformance: "Weight shifts onto one foot. Free hand goes slack; the glass falls. She does not look down. Hair moves as she flinches.",
    cameraAction: "Slow dolly around her, subtle handheld, ending closer on her ear and the phone.",
    environmentMotion: "Water glass hits the sink with a dull splash. Steam from a forgotten kettle. City night glow at the window.",
    narration: "Su nombre. Lo murmuró el teléfono. Su voz, inconfundible, pero con una capa de polvo.",
    lipsync: false,
  },
  {
    sceneIndex: 1,
    action: "Elena stays frozen while the voicemail continues; her empty hand trembles over the wet sink, then she turns toward the sofa.",
    facialPerformance: "Insomniac eyes glass over. A tiny head shake of disbelief. Breath stutters.",
    bodyPerformance: "She wipes wet fingers on her home clothes, then walks three steps toward the sofa, phone still pressed to her cheek.",
    cameraAction: "Tracking handheld with her walk, slight push-in.",
    environmentMotion: "Dripping faucet. Loose sweater fabric sways. Lamp cord shadows swing.",
    narration: "La mano de Elena se paralizó. El vaso se le escurrió por los dedos.",
    lipsync: false,
  },
  {
    sceneIndex: 2,
    action: "Elena sits on the edge of the worn sofa, knees together, phone glued to her ear, listening to Mateo's recorded voice.",
    facialPerformance: "Eyes locked on an invisible point on the wall. A trapped breath. Micro-tremor in the chin. She does not mouth the words.",
    bodyPerformance: "She perches, then sinks a little. Free hand grips the sofa cushion. Shoulders rise with a held inhale.",
    cameraAction: "Slow push-in from medium to close-up, locked-off then tiny handheld breathe.",
    environmentMotion: "Warm floor lamp throws moving shadows as she shifts. Phone screen pulses against her cheek.",
    narration: "Si estás escuchando esto, ha pasado mucho. Mateo. Su Mateo. Solo su eco. Una grabación programada.",
    lipsync: false,
  },
  {
    sceneIndex: 3,
    action: "Elena curls into the sofa, hugging her knees, phone against her cheek, fighting a tremor as Mateo's laugh plays from the speaker.",
    facialPerformance: "Mouth opens without sound. Eyes shine. She almost smiles at the laugh then the smile collapses.",
    bodyPerformance: "Knees pull tighter. Free hand fists in her lap. Shoulders contract, then a small rock forward.",
    cameraAction: "Intimate close-up, slow handheld orbit a few degrees, then settle.",
    environmentMotion: "Apartment night hush. The laugh from the tiny speaker. Fabric of the sofa compresses.",
    narration: "Recuerdas la azotea... las estrellas. Te prometí que siempre estaríamos.",
    lipsync: false,
  },
  {
    sceneIndex: 4,
    action: "Barefoot Elena, messy hair, phone still in her hand, stands in Iván's apartment doorway. Iván steps into the SAME hallway with a hot cup of coffee and offers it. She looks up at him.",
    facialPerformance: "Elena's face is raw, unguarded. Iván's eyes are discreet but steady. She meets his look; a small head-shake no.",
    bodyPerformance: "Iván walks into frame from inside the apartment and extends the cup. Elena's shoulders drop. She does not take the cup yet.",
    cameraAction: "Over-the-threshold two-shot, slow handheld, both bodies fully in one continuous space.",
    environmentMotion: "Doorlight spills into the dim corridor. Steam rises from the coffee. Her hair moves as she turns to him.",
    narration: "Tocó la puerta del cinco. Iván ya estaba allí. Café caliente en una mano.",
    lipsync: false,
    sharedSpace: true,
  },
  {
    sceneIndex: 4,
    action: "Elena slides down to sit on the cold hallway floor. Iván crouches into the same corridor, sets the coffee beside her, and stays with her.",
    facialPerformance: "Elena looks at the floor then at him. Iván listens without crowding. Quiet care, not a smile.",
    bodyPerformance: "She lowers herself against the wall, phone still clenched. He places the cup on the floor between them. Knees in the same shot.",
    cameraAction: "Handheld descend with her sit, then a level two-shot of both in the hallway.",
    environmentMotion: "Steam curls between them. Building pipes tick. Bare feet on tile.",
    narration: "El silencio le pesaba menos con él que sola. Se sentó en el pasillo, en el suelo frío.",
    lipsync: false,
    sharedSpace: true,
  },
  {
    sceneIndex: 5,
    action: "Elena holds out the phone between them in the hallway. Iván leans in to listen to the voicemail while Elena watches his face in the same physical frame.",
    facialPerformance: "Iván's expression turns unreadable then concentrated. Elena searches his eyes for an answer he does not have yet.",
    bodyPerformance: "Elena's hand extends the phone. Iván tilts his head toward the speaker. They share the narrow corridor; coffee cup cooling near their knees.",
    cameraAction: "Close two-shot, slow push-in on the phone then tilt up to both faces. One camera, one space.",
    environmentMotion: "Sound-wave animation on the phone screen. Steam thinning from the cup. Corridor light flicker.",
    narration: "Hay algo que tienes que encontrar. Un lugar.",
    lipsync: false,
    sharedSpace: true,
  },
  {
    sceneIndex: 5,
    action: "Cliffhanger: Elena lifts her eyes to Iván as Mateo's voice fills the hallway. The coffee cools. They look at each other and do not move away.",
    facialPerformance: "Elena's look is a question. Iván holds it, jaw set. No dialogue from their mouths. The mystery sits between them.",
    bodyPerformance: "Slight lean toward each other. Elena's thumb tightens on the phone. Iván's hand rests near the cup but does not pick it up.",
    cameraAction: "Slow cinematic push-in to a tight two-shot, subtle handheld, hold on their shared look.",
    environmentMotion: "Coffee steam dies. Hallway goes quieter. Phone screen dims a fraction.",
    narration: "La voz de Mateo llenó el pasillo. Elena levantó la mirada. El café se enfriaba. Una nueva promesa.",
    lipsync: false,
    sharedSpace: true,
  },
]

function buildImagePrompt(spec, elements) {
  const identity = elementPromptPrefix(elements)
  const still = spec.imagePrompt || spec.action
  return assertNoSplitScreenPrompt(
    [identity, still, "Photoreal cinematic vertical 9:16 still. One continuous camera frame. Frozen first frame for later animation. Mateo remains off-camera."]
      .filter(Boolean)
      .join(". "),
  )
}

function buildMotionPrompt(spec, elements, { includeStartFrame = false } = {}) {
  const identity = elementPromptPrefix(elements)
  const start = includeStartFrame
    ? "Use the first-frame still as composition, wardrobe, and lighting. Immediately animate living performance. Do not hold a still photograph. "
    : ""
  const prompt = [
    start + identity + ".",
    `CHARACTER ACTION: ${spec.action}`,
    `FACIAL MOTION: ${spec.facialPerformance}`,
    `BODY MOTION: ${spec.bodyPerformance}`,
    `HAND/PROP MOTION: ${spec.bodyPerformance}`,
    `CAMERA MOTION: ${spec.cameraAction}`,
    `ENVIRONMENTAL MOTION: ${spec.environmentMotion}`,
    motionIdentityLock(elements),
  ].join(" ")
  return assertNoSplitScreenPrompt(prompt)
}

export function shouldApplyLipsync(shot) {
  return Boolean(shot?.lipsync) && (shot.onScreenCharacterIds || []).length > 0
}

export function condenseNarrationForShot(spec) {
  return String(spec.narration || "").trim()
}

function presenceForScene(scenes, characters, sceneIndex) {
  const scene = scenes[sceneIndex]
  if (!scene) {
    return {
      onScreenCharacterIds: [],
      voiceOnlyCharacterIds: [],
      onScreen: [],
      voiceOnly: [],
      characterElements: [],
    }
  }
  return sceneVideoPresence(scene, characters)
}

export function planEpisodeMotionShots(screenplay, characters, {
  seriesId,
  episodeNumber,
  durationSec = null,
  usdPerSecond = KLING_O1_USD_PER_SECOND,
  capUsd = MOTION_V1_HARD_CAP_USD,
  env = process.env,
} = {}) {
  const engine = resolveClipEngine(env)
  const paidExternal = engine.paidExternal
  const shotDuration = durationSec == null
    ? (engine.id === "self_hosted_workflow" ? 8 : DEFAULT_SHOT_DURATION_SEC)
    : Number(durationSec)
  const scenes = Array.isArray(screenplay?.scenes) ? screenplay.scenes : []
  const ep1 = Number(seriesId) === 2 && Number(episodeNumber) === 1
  const specs = ep1 ? EP1_SHOT_SPECS : scenes.map((scene, sceneIndex) => ({
    sceneIndex,
    action: getSceneStoryboard(scene).action || scene.visual_description || "Character acts in the scene.",
    facialPerformance: "Natural facial performance, changing expression.",
    bodyPerformance: "Natural body motion, hands and clothing moving.",
    cameraAction: "Subtle handheld cinematic camera.",
    environmentMotion: "Living environment, practical lights, air movement.",
    narration: scene.text_es || scene.text_en || "",
    lipsync: false,
    sharedSpace: (getSceneStoryboard(scene).onScreenCharacterIds || []).length >= 2,
  }))

  const shots = specs.map((spec, index) => {
    const presence = presenceForScene(scenes, characters, spec.sceneIndex)
    const allowStartFrame = shotAllowsStartFrame(spec.sceneIndex)
    const imagePrompt = buildImagePrompt(spec, presence.characterElements)
    const motionPrompt = buildMotionPrompt(spec, presence.characterElements, { includeStartFrame: allowStartFrame })
    return {
      shotId: padShotId(index),
      shotIndex: index,
      sceneIndex: spec.sceneIndex,
      duration: Number(shotDuration),
      onScreenCharacterIds: presence.onScreenCharacterIds,
      voiceOnlyCharacterIds: presence.voiceOnlyCharacterIds,
      characterElements: presence.characterElements,
      action: spec.action,
      facialPerformance: spec.facialPerformance,
      bodyPerformance: spec.bodyPerformance,
      cameraAction: spec.cameraAction,
      environmentMotion: spec.environmentMotion,
      dialogue: condenseNarrationForShot(spec),
      narration: condenseNarrationForShot(spec),
      imagePrompt,
      motionPrompt,
      videoPrompt: motionPrompt,
      model: engine.model,
      allowStartFrame,
      sharedSpace: Boolean(spec.sharedSpace) || presence.onScreenCharacterIds.length >= 2,
      lipsync: shouldApplyLipsync(spec),
      outputPath: null,
      outputUrl: null,
    }
  })

  const fitted = fitShotsToCap(shots, {
    usdPerSecond,
    capUsd,
    skipCap: !paidExternal,
  })
  fitted.engine = engine.id
  fitted.model = engine.model
  fitted.paidExternal = paidExternal
  fitted.projectedUsd = paidExternal ? fitted.projectedUsd : 0
  fitted.withinCap = true
  for (const shot of fitted.shots) {
    assertNoSplitScreenPrompt(shot.videoPrompt)
  }

  return fitted
}

export function fitShotsToCap(shots, {
  usdPerSecond = KLING_O1_USD_PER_SECOND,
  capUsd = MOTION_V1_HARD_CAP_USD,
  minShots = MOTION_V1_MIN_SHOTS,
  maxShots = MOTION_V1_MAX_SHOTS,
  minTotal = MOTION_V1_MIN_DURATION_SEC,
  maxTotal = MOTION_V1_MAX_DURATION_SEC,
  skipCap = false,
} = {}) {
  let next = (shots || []).slice(0, maxShots).map((shot) => ({ ...shot }))
  if (next.length < minShots && shots.length >= minShots) {
    next = shots.slice(0, minShots)
  }

  function totals(list) {
    const totalDurationSec = list.reduce((sum, shot) => sum + Number(shot.duration || 0), 0)
    const projectedUsd = klingCostUsd(totalDurationSec, usdPerSecond)
    return { totalDurationSec, projectedUsd }
  }

  let { totalDurationSec, projectedUsd } = totals(next)
  if (!skipCap) {
    while (projectedUsd > capUsd && next.some((shot) => Number(shot.duration) > 5)) {
      const longest = [...next].sort((a, b) => Number(b.duration) - Number(a.duration))[0]
      longest.duration = Math.max(5, Number(longest.duration) - 1)
      ;({ totalDurationSec, projectedUsd } = totals(next))
    }
    while (projectedUsd > capUsd && next.length > minShots) {
      next.pop()
      ;({ totalDurationSec, projectedUsd } = totals(next))
    }
    assertCostWithinCap(projectedUsd, capUsd)
  }
  if (!skipCap && totalDurationSec > maxTotal) {
    const scale = maxTotal / totalDurationSec
    for (const shot of next) {
      shot.duration = Math.max(5, Math.min(10, Math.round(shot.duration * scale)))
    }
    ;({ totalDurationSec, projectedUsd } = totals(next))
    if (!skipCap) assertCostWithinCap(projectedUsd, capUsd)
  }

  return {
    shots: next,
    shotCount: next.length,
    totalDurationSec,
    projectedUsd: skipCap ? 0 : roundUsd(projectedUsd),
    usdPerSecond: skipCap ? 0 : usdPerSecond,
    capUsd: skipCap ? 0 : capUsd,
    model: next[0]?.model || "minimax_h3",
    withinCap: skipCap ? true : projectedUsd <= capUsd,
    meetsDurationFloor: totalDurationSec >= minTotal,
    staticStillOnlyDurationSec: 0,
  }
}

export function motionValidationReport(plan, { clipCount = null, totalAiSeconds = null, staticStillOnlyDurationSec = 0 } = {}) {
  const clips = clipCount == null ? plan.shotCount : clipCount
  const aiSeconds = totalAiSeconds == null ? plan.totalDurationSec : totalAiSeconds
  const stills = Number(staticStillOnlyDurationSec)
  const pass = clips >= MOTION_V1_MIN_SHOTS
    && aiSeconds >= MOTION_V1_MIN_DURATION_SEC
    && stills <= 2
  return {
    pass,
    AI_VIDEO_CLIPS: clips,
    TOTAL_AI_VIDEO_DURATION: aiSeconds,
    STATIC_STILL_ONLY_DURATION: stills,
    required: {
      AI_VIDEO_CLIPS: MOTION_V1_MIN_SHOTS,
      TOTAL_AI_VIDEO_DURATION: MOTION_V1_MIN_DURATION_SEC,
      STATIC_STILL_ONLY_DURATION_MAX: 2,
    },
  }
}

export function usesKenBurnsSubstitute(source) {
  return /transform:\s*`scale\(|Ken Burns|zoomIn \? \[1, 1\.15\]/i.test(String(source || ""))
}
