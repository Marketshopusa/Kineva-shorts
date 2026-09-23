#!/usr/bin/env node
/**
 * Integration probe: one 8s MiniMax H3 clip via the self-hosted worker.
 * Never calls Fal/Kling/Veo/Runway/Luma.
 */
import { inspectClipEngineReadiness } from "../lib/video-engine.js"
import { generateClip } from "../lib/providers/video/kineva-engine.js"
import { auditMinimaxH3 } from "../lib/providers/video/minimax-h3.js"

const ready = inspectClipEngineReadiness()
const audit = auditMinimaxH3()
console.log(JSON.stringify({
  engine: ready.engine,
  ready: ready.ready,
  blocks: ready.blocks,
  WORKFLOW_IMPORTED: audit.WORKFLOW_IMPORTED,
  falVideoCalls: 0,
}, null, 2))

if (!ready.ready) {
  console.error("VIDEO_WORKER_MISSING: set VIDEO_WORKER_URL + VIDEO_WORKER_TOKEN on a GPU host running scripts/video-worker.mjs")
  process.exit(2)
}
if (!audit.WORKFLOW_IMPORTED) {
  console.error("WORKFLOW_JSON_MISSING: export the real MiniMax H3 ComfyUI API JSON to workflows/minimax-h3/workflow.json")
  process.exit(2)
}

const job = await generateClip({
  episodeId: 2,
  seriesId: 2,
  shotId: "shot-01",
  prompt: "The phone vibrates. Elena lowers her gaze, holds her breath, reaches slowly, and reads the unknown number. Natural body motion. Slow cinematic push-in.",
  duration: 8,
  width: 480,
  height: 864,
})
console.log(JSON.stringify({ queued: job, falVideoCalls: 0 }, null, 2))
