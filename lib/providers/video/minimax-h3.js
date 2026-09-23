import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

export const MINIMAX_H3_WORKFLOW_ID = "minimax_h3"
export const MINIMAX_H3_CAPTURE_NOTES = Object.freeze({
  source: "user capture — NOT verified until workflow JSON is imported",
  aspectSelector: "9:16 Portrait",
  selectorResolution: { width: 480, height: 864, megapixels: 0.4, multiple: 32 },
  nodeWidgetsVisible: { width: 1344, height: 768 },
  durationVisible: 8,
  turboStrengthVisible: 1,
  turboStepsVisible: 5,
  firstFrame: "input image",
  lastFrame: "input available",
  prompt: "input available",
  unverifiedModelFilenames: [
    "minimax_h3_fl2va_pruned_int8_convot.safetensors",
    "qwen3vl_32b_minimax_h3_nf4_awq.safetensors",
    "minimax_h3_video_vae_fp16.safetensors",
    "minimax_h3_audio_vae_fp32.safetensors",
  ],
  resolutionConflict: "Selector shows 480x864 9:16; MiniMax H3 node widgets showed 1344x768. Do not change until the real JSON is read.",
})

export function defaultGenerationSize() {
  return { width: 480, height: 864, aspectRatio: "9:16" }
}

export function finalOutputSize() {
  return { width: 1080, height: 1920, aspectRatio: "9:16" }
}

function nodeType(node) {
  return String(node?.type || node?.class_type || "")
}

function widgetValue(node, names) {
  const widgets = node?.widgets_values
  const inputs = node?.inputs
  for (const name of names) {
    if (inputs && inputs[name] != null && !Array.isArray(inputs[name])) return inputs[name]
  }
  if (Array.isArray(widgets) && widgets.length) return widgets
  return null
}

/**
 * Parse a ComfyUI workflow export (UI or API format). Empty/missing file → not imported.
 */
export function inspectComfyWorkflow(raw) {
  if (!raw || typeof raw !== "object") {
    return { imported: false, engine: null, nodes: [], inputs: {}, models: [], classTypes: [] }
  }
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes
    : Object.entries(raw).map(([id, node]) => ({ id, ...node }))
  const classTypes = [...new Set(nodes.map(nodeType).filter(Boolean))]
  const models = []
  const text = JSON.stringify(raw)
  const files = text.match(/[A-Za-z0-9._-]+\.safetensors/g) || []
  for (const file of files) {
    if (!models.includes(file)) models.push(file)
  }
  const minimaxNodes = nodes.filter((node) => /minimax|h3|image.?to.?video|i2v/i.test(nodeType(node)))
  return {
    imported: true,
    engine: "ComfyUI",
    nodeCount: nodes.length,
    classTypes,
    models,
    minimaxNodeTypes: [...new Set(minimaxNodes.map(nodeType))],
    inputs: {
      first_frame: true,
      last_frame: /last.?frame/i.test(text),
      prompt: /prompt/i.test(text),
      width: true,
      height: true,
      duration: /duration|seconds|num_frames|length/i.test(text),
      seed: /seed/i.test(text),
    },
    widgetHint: minimaxNodes[0] ? widgetValue(minimaxNodes[0], ["width", "height", "duration"]) : null,
  }
}

export function loadWorkflowJson(workflowPath, { cwd = process.cwd() } = {}) {
  const resolved = path.isAbsolute(workflowPath)
    ? workflowPath
    : path.join(cwd, workflowPath)
  if (!existsSync(resolved)) {
    return {
      imported: false,
      path: resolved,
      exists: false,
      reason: "WORKFLOW_JSON_MISSING",
      captureNotes: MINIMAX_H3_CAPTURE_NOTES,
    }
  }
  const raw = JSON.parse(readFileSync(resolved, "utf8"))
  return {
    imported: true,
    path: resolved,
    exists: true,
    ...inspectComfyWorkflow(raw),
    captureNotes: MINIMAX_H3_CAPTURE_NOTES,
    raw,
  }
}

export function auditMinimaxH3({ env = process.env, cwd = process.cwd() } = {}) {
  const workflowPath = env.VIDEO_WORKFLOW_JSON || env.MINIMAX_H3_WORKFLOW_JSON || "workflows/minimax-h3/workflow.json"
  const loaded = loadWorkflowJson(workflowPath, { cwd })
  return {
    WORKFLOW_ENGINE: loaded.imported ? loaded.engine : "ComfyUI (inferred from capture; JSON not in repo)",
    WORKFLOW_JSON: loaded.path,
    WORKFLOW_IMPORTED: loaded.imported,
    CUSTOM_NODES: loaded.classTypes || [],
    MODEL_FILES: loaded.models || [],
    INPUTS: loaded.inputs || {
      first_frame: "required (capture)",
      last_frame: "optional (capture)",
      prompt: "required (capture)",
      width: "unverified — selector 480 vs node 1344",
      height: "unverified — selector 864 vs node 768",
      duration: "8.0 visible in capture",
      seed: "unknown until JSON",
    },
    OUTPUT: "video file (expected from Image-to-Video node)",
    GPU: env.VIDEO_WORKER_GPU || "UNKNOWN",
    VRAM: env.VIDEO_WORKER_VRAM || "UNKNOWN",
    GENERATION_RESOLUTION: defaultGenerationSize(),
    FINAL_RESOLUTION: finalOutputSize(),
    TURBO: {
      strength: MINIMAX_H3_CAPTURE_NOTES.turboStrengthVisible,
      steps: MINIMAX_H3_CAPTURE_NOTES.turboStepsVisible,
      verified: false,
    },
    reason: loaded.imported ? null : loaded.reason,
    captureNotes: MINIMAX_H3_CAPTURE_NOTES,
  }
}

export function toComfyApiPrompt(raw) {
  if (!raw || typeof raw !== "object") return null
  const values = Object.values(raw)
  if (values.some((node) => node && typeof node === "object" && node.class_type)) {
    const next = {}
    for (const [id, node] of Object.entries(raw)) {
      if (id === "nodes" || id === "links" || id === "groups") continue
      if (node && typeof node === "object" && node.class_type) next[id] = node
    }
    return Object.keys(next).length ? next : null
  }
  return null
}

export function applyWorkflowInputs(apiPrompt, {
  firstFrameName,
  lastFrameName,
  prompt,
  width,
  height,
  duration,
  seed,
} = {}) {
  const graph = toComfyApiPrompt(apiPrompt)
  if (!graph) {
    const err = new Error("WORKFLOW_JSON_MISSING")
    err.code = "WORKFLOW_JSON_MISSING"
    throw err
  }
  const next = JSON.parse(JSON.stringify(graph))
  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") continue
    const type = nodeType(node)
    const inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : null
    if (!inputs) continue
    if (prompt != null && ("prompt" in inputs || /prompt/i.test(type))) inputs.prompt = prompt
    if (width != null && "width" in inputs) inputs.width = width
    if (height != null && "height" in inputs) inputs.height = height
    if (duration != null && ("duration" in inputs || "seconds" in inputs)) {
      if ("duration" in inputs) inputs.duration = duration
      if ("seconds" in inputs) inputs.seconds = duration
    }
    if (seed != null && "seed" in inputs) inputs.seed = seed
    if (firstFrameName && ("image" in inputs || "first_frame" in inputs || "start_image" in inputs)) {
      if ("first_frame" in inputs) inputs.first_frame = firstFrameName
      else if ("start_image" in inputs) inputs.start_image = firstFrameName
    }
    if (lastFrameName && ("last_frame" in inputs || "end_image" in inputs)) {
      if ("last_frame" in inputs) inputs.last_frame = lastFrameName
      if ("end_image" in inputs) inputs.end_image = lastFrameName
    }
  }
  return next
}
