import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveClipEngine,
  resolveStandardVideoProvider,
  premiumVideoExplicitlyAllowed,
  falVideoAllowed,
  inspectClipEngineReadiness,
  isPremiumVideoProvider,
  assertPremiumVideoNotUsed,
  STANDARD_VIDEO_PROVIDER_DEFAULT,
} from "../../lib/video-engine.js"
import { submitKlingO1Job } from "../../lib/providers/video/kling.js"
import { auditMinimaxH3, inspectComfyWorkflow, loadWorkflowJson, applyWorkflowInputs, toComfyApiPrompt } from "../../lib/providers/video/minimax-h3.js"
import {
  createVideoJob,
  submitJobToWorker,
  generateClip,
  queueEpisodeShots,
  rollupEpisodeCost,
  MAX_TECHNICAL_RETRIES,
  MAX_AESTHETIC_RETRIES_DEFAULT,
} from "../../lib/providers/video/kineva-engine.js"
import { minimaxRenderPath } from "../../lib/video-clip-storage.js"

test("standard video engine is self-hosted MiniMax, not Kling", () => {
  const engine = resolveClipEngine({})
  assert.equal(STANDARD_VIDEO_PROVIDER_DEFAULT, "self_hosted_workflow")
  assert.equal(resolveStandardVideoProvider({}), "self_hosted_workflow")
  assert.equal(engine.id, "self_hosted_workflow")
  assert.equal(engine.model, "minimax_h3")
  assert.equal(engine.paidExternal, false)
  assert.equal(engine.mode, "KINEVA_STANDARD")
})

test("Kling/Veo/Runway/Luma are premium and disabled by default", () => {
  assert.equal(isPremiumVideoProvider("kling"), true)
  assert.equal(isPremiumVideoProvider("veo"), true)
  assert.equal(premiumVideoExplicitlyAllowed({}), false)
  assert.equal(falVideoAllowed({ FAL_ALLOW_GENERATE: "1" }), false)
  assert.throws(
    () => resolveClipEngine({ STANDARD_VIDEO_PROVIDER: "kling" }),
    /PREMIUM_VIDEO_DISABLED/,
  )
  assert.throws(
    () => assertPremiumVideoNotUsed({}, "kling"),
    /PREMIUM_VIDEO_DISABLED/,
  )
})

test("Fal Kling submit is frozen without PREMIUM_VIDEO_ALLOW and FAL_ALLOW_VIDEO", async () => {
  await assert.rejects(
    () => submitKlingO1Job({ prompt: "no" }, { FAL_KEY: "x", FAL_ALLOW_GENERATE: "1" }, async () => {
      throw new Error("should not fetch Fal video")
    }),
    /PREMIUM_VIDEO_DISABLED/,
  )
})

test("self-hosted worker missing is a hard error, not a premium fallback", async () => {
  const ready = inspectClipEngineReadiness({})
  assert.equal(ready.ready, false)
  assert.equal(ready.blocks[0].code, "VIDEO_WORKER_MISSING")
  const job = createVideoJob({ episodeId: 2, shotId: "shot-01", prompt: "act", duration: 8 })
  await assert.rejects(
    () => submitJobToWorker(job, { env: {}, fetchFn: async () => { throw new Error("no fetch") } }),
    (err) => err.code === "VIDEO_WORKER_MISSING" || /VIDEO_WORKER/.test(err.message),
  )
  assert.equal(MAX_TECHNICAL_RETRIES, 1)
})

test("MiniMax workflow JSON is not invented when missing", () => {
  const audit = auditMinimaxH3({ cwd: process.cwd(), env: {} })
  assert.equal(audit.WORKFLOW_IMPORTED, false)
  assert.equal(audit.reason, "WORKFLOW_JSON_MISSING")
  assert.equal(audit.GENERATION_RESOLUTION.width, 480)
  assert.equal(audit.GENERATION_RESOLUTION.height, 864)
  assert.match(audit.captureNotes.resolutionConflict, /1344x768/)
  const loaded = loadWorkflowJson("workflows/minimax-h3/workflow.json")
  assert.equal(loaded.imported, false)
})

test("ComfyUI inspector reads real graphs when provided", () => {
  const parsed = inspectComfyWorkflow({
    "3": {
      class_type: "MiniMaxH3ImageToVideo",
      inputs: {
        prompt: "move",
        width: 480,
        height: 864,
        duration: 8,
        first_frame: "start.png",
        last_frame: "end.png",
        unet_name: "minimax_h3_example.safetensors",
      },
    },
  })
  assert.equal(parsed.imported, true)
  assert.equal(parsed.engine, "ComfyUI")
  assert.ok(parsed.models.includes("minimax_h3_example.safetensors"))
  assert.equal(parsed.inputs.last_frame, true)
})

test("final MiniMax episode path is isolated from legacy animatic", () => {
  assert.equal(minimaxRenderPath(2, 2), "series/2/episodes/2/episode-1-minimax-v1.mp4")
})

test("generateClip is the KinevaVideoEngine entry and does not fall back to premium", async () => {
  await assert.rejects(
    () => generateClip({ episodeId: 2, shotId: "shot-01", prompt: "act", duration: 8 }, {
      env: {},
      fetchFn: async () => { throw new Error("no fetch") },
    }),
    (err) => err.code === "VIDEO_WORKER_MISSING" || /VIDEO_WORKER/.test(err.message),
  )
})

test("queueEpisodeShots fails closed when the GPU worker is missing", async () => {
  await assert.rejects(
    () => queueEpisodeShots({
      episodeId: 2,
      seriesId: 2,
      shots: [{ shotId: "shot-01", videoPrompt: "move", duration: 8, onScreenCharacterIds: [2] }],
    }, { env: {}, fetchFn: async () => { throw new Error("no fetch") } }),
    (err) => err.code === "VIDEO_WORKER_MISSING" || /VIDEO_WORKER/.test(err.message),
  )
})

test("technical retries are 1 and aesthetic retries default to 0", () => {
  assert.equal(MAX_TECHNICAL_RETRIES, 1)
  assert.equal(MAX_AESTHETIC_RETRIES_DEFAULT, 0)
  const cost = rollupEpisodeCost([
    { status: "COMPLETED", duration: 8, metrics: { gpu_seconds: 180, retry_count: 0 }, model: "minimax_h3" },
  ], { gpuHourRate: 0.8 })
  assert.equal(cost.estimatedComputeCost, 0.04)
  assert.equal(cost.projectedCost50Episodes, 2)
})

test("applyWorkflowInputs patches a real Comfy API graph and rejects UI exports", () => {
  const patched = applyWorkflowInputs({
    "3": {
      class_type: "MiniMaxH3ImageToVideo",
      inputs: { prompt: "old", width: 1344, height: 768, duration: 8, first_frame: "a.png" },
    },
  }, { prompt: "new motion", width: 480, height: 864, duration: 8, firstFrameName: "elena.png" })
  assert.equal(patched["3"].inputs.prompt, "new motion")
  assert.equal(patched["3"].inputs.width, 480)
  assert.equal(patched["3"].inputs.height, 864)
  assert.equal(patched["3"].inputs.first_frame, "elena.png")
  assert.equal(toComfyApiPrompt({ nodes: [{ type: "Foo" }] }), null)
})
