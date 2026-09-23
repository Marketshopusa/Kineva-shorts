import { blockedConfig } from "./content-rails.js"

export const STANDARD_VIDEO_PROVIDER_DEFAULT = "self_hosted_workflow"
export const VIDEO_EDIT_PROVIDER = "remotion"

export const PREMIUM_VIDEO_PROVIDERS = Object.freeze([
  "kling",
  "fal-video",
  "fal-ai/kling-video/o1/reference-to-video",
  "veo",
  "runway",
  "luma",
])

export const PRODUCT_MODES = Object.freeze({
  preview: "KINEVA_PREVIEW",
  standard: "KINEVA_STANDARD",
  premium: "KINEVA_PREMIUM",
})

export function isPremiumVideoProvider(id) {
  const value = String(id || "").toLowerCase()
  if (!value) return false
  if (PREMIUM_VIDEO_PROVIDERS.includes(value)) return true
  if (value.includes("kling") || value.includes("veo") || value.includes("runway") || value.includes("luma")) return true
  if (value.includes("fal-ai/") && value.includes("video")) return true
  return false
}

export function premiumVideoExplicitlyAllowed(env = process.env) {
  return env.PREMIUM_VIDEO_ALLOW === "1" && Boolean(String(env.PREMIUM_VIDEO_PROVIDER || "").trim())
}

export function resolveStandardVideoProvider(env = process.env) {
  const raw = String(env.STANDARD_VIDEO_PROVIDER || STANDARD_VIDEO_PROVIDER_DEFAULT).toLowerCase().trim()
  return raw || STANDARD_VIDEO_PROVIDER_DEFAULT
}

/**
 * Clip generation engine. Remotion stays the editor, never the motion generator.
 * Premium APIs never silently replace the standard self-hosted engine.
 */
export function resolveClipEngine(env = process.env) {
  const standard = resolveStandardVideoProvider(env)
  if (isPremiumVideoProvider(standard) && !premiumVideoExplicitlyAllowed(env)) {
    throw blockedConfig(
      "video",
      "PREMIUM_VIDEO_DISABLED: kling/veo/runway/luma are frozen. STANDARD_VIDEO_PROVIDER=self_hosted_workflow",
    )
  }
  if (standard === "remotion" || standard === "remotion_animatic") {
    return {
      id: "remotion_animatic",
      mode: PRODUCT_MODES.preview,
      model: "remotion-ken-burns",
      paidExternal: false,
    }
  }
  if (isPremiumVideoProvider(standard)) {
    const premium = String(env.PREMIUM_VIDEO_PROVIDER || standard).toLowerCase()
    return {
      id: premium,
      mode: PRODUCT_MODES.premium,
      model: premium,
      paidExternal: true,
    }
  }
  return {
    id: "self_hosted_workflow",
    mode: PRODUCT_MODES.standard,
    model: "minimax_h3",
    paidExternal: false,
  }
}

export function assertPremiumVideoNotUsed(env = process.env, requestedProvider = null) {
  if (!requestedProvider) return false
  if (!isPremiumVideoProvider(requestedProvider)) return false
  if (premiumVideoExplicitlyAllowed(env) && String(env.PREMIUM_VIDEO_PROVIDER).toLowerCase() === String(requestedProvider).toLowerCase()) {
    return true
  }
  throw blockedConfig(
    "video",
    `PREMIUM_VIDEO_DISABLED: refused ${requestedProvider} (no silent Fal/Kling/Veo/Runway/Luma fallback)`,
  )
}

export function falVideoAllowed(env = process.env) {
  return env.FAL_ALLOW_VIDEO === "1" && premiumVideoExplicitlyAllowed(env)
}

export function videoWorkerConfig(env = process.env) {
  const url = String(env.VIDEO_WORKER_URL || "").replace(/\/$/, "")
  const token = String(env.VIDEO_WORKER_TOKEN || "").trim()
  return {
    url: url || null,
    token: token || null,
    workflowJsonPath: env.VIDEO_WORKFLOW_JSON || env.MINIMAX_H3_WORKFLOW_JSON || "workflows/minimax-h3/workflow.json",
    comfyUrl: String(env.COMFYUI_URL || "").replace(/\/$/, "") || null,
  }
}

export function inspectClipEngineReadiness(env = process.env) {
  const engine = resolveClipEngine(env)
  const worker = videoWorkerConfig(env)
  const blocks = []
  if (engine.id === "self_hosted_workflow") {
    if (!worker.url) {
      blocks.push({ kind: "video", code: "VIDEO_WORKER_MISSING", detail: "VIDEO_WORKER_URL absent" })
    }
    if (worker.url && !worker.token) {
      blocks.push({ kind: "video", code: "BLOCKED_CONFIG", detail: "VIDEO_WORKER_TOKEN absent" })
    }
  }
  if (engine.paidExternal && !falVideoAllowed(env) && /kling|fal/.test(engine.id)) {
    blocks.push({ kind: "video", code: "PREMIUM_VIDEO_DISABLED", detail: "FAL_ALLOW_VIDEO is not 1" })
  }
  return { engine, worker, blocks, ready: blocks.length === 0 }
}
