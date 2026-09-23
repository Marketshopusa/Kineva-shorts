export function jsonRailError(err) {
  const msg = String(err?.message || err)
  const code = err?.code || ""
  if (code === "BLOCKED_CONFIG" || msg.startsWith("BLOCKED_CONFIG")) {
    return Response.json({ error: msg, code: code || "BLOCKED_CONFIG" }, { status: 400 })
  }
  if (code === "BLOCKED_BALANCE" || msg.startsWith("BLOCKED_BALANCE")) {
    return Response.json({ error: msg, code: code || "BLOCKED_BALANCE" }, { status: 402 })
  }
  if (err?.status === 429 || /BLOQUEADO POR CUOTA/i.test(msg)) {
    return Response.json({ error: msg }, { status: 429 })
  }
  if (code === "UNKNOWN_RATING" || code === "RAIL_MISMATCH" || msg.startsWith("UNKNOWN_RATING") || msg.startsWith("RAIL_MISMATCH")) {
    return Response.json({ error: msg, code: code || "RAIL_MISMATCH" }, { status: 400 })
  }
  if (code === "STORYBOARD_ON_SCREEN_UNSET" || msg.includes("STORYBOARD_ON_SCREEN_UNSET")) {
    return Response.json({ error: msg, code: "STORYBOARD_ON_SCREEN_UNSET" }, { status: 400 })
  }
  if (code === "REQUIRED_VISUAL_CHARACTER_NOT_LOCKED" || msg.includes("REQUIRED_VISUAL_CHARACTER_NOT_LOCKED")) {
    return Response.json({ error: msg, code: "REQUIRED_VISUAL_CHARACTER_NOT_LOCKED" }, { status: 409 })
  }
  if (code === "CANONICAL_REFERENCE_UNRESOLVED" || msg.includes("CANONICAL_REFERENCE_UNRESOLVED")) {
    return Response.json({ error: msg, code: "CANONICAL_REFERENCE_UNRESOLVED" }, { status: 409 })
  }
  if (code === "IMAGES_BUCKET_NOT_READY" || msg.includes("IMAGES_BUCKET_NOT_READY")) {
    return Response.json({ error: msg, code: "IMAGES_BUCKET_NOT_READY" }, { status: 503 })
  }
  if (code === "IDENTITY_STILL_REQUIRES_FAL" || msg.includes("IDENTITY_STILL_REQUIRES_FAL")) {
    return Response.json({ error: msg, code: "IDENTITY_STILL_REQUIRES_FAL", falCalls: 0 }, { status: 409 })
  }
  if (code === "IDENTITY_STILL_MODEL_MISMATCH" || msg.includes("IDENTITY_STILL_MODEL_MISMATCH")) {
    return Response.json({ error: msg, code: "IDENTITY_STILL_MODEL_MISMATCH", falCalls: 0 }, { status: 409 })
  }
  if (code === "PROVIDER_ERROR" || msg.startsWith("PROVIDER_ERROR")) {
    return Response.json({ error: msg }, { status: 502 })
  }
  if (code === "REFERENCE_AWARE_FAILED" || msg.startsWith("REFERENCE_AWARE_FAILED")) {
    return Response.json({ error: msg, code: "REFERENCE_AWARE_FAILED" }, { status: 502 })
  }
  if (code === "VIDEO_COST_CAP" || msg.includes("VIDEO_COST_CAP")) {
    return Response.json({ error: msg, code: "VIDEO_COST_CAP", falCalls: 0 }, { status: 409 })
  }
  if (code === "SPLIT_SCREEN_PROMPT_FORBIDDEN" || msg.includes("SPLIT_SCREEN_PROMPT_FORBIDDEN")) {
    return Response.json({ error: msg, code: "SPLIT_SCREEN_PROMPT_FORBIDDEN", falCalls: 0 }, { status: 409 })
  }
  if (code === "MATEO_MUST_REMAIN_VOICE_ONLY" || msg.includes("MATEO_MUST_REMAIN_VOICE_ONLY")) {
    return Response.json({ error: msg, code: "MATEO_MUST_REMAIN_VOICE_ONLY", falCalls: 0 }, { status: 409 })
  }
  if (code === "VIDEO_WORKER_MISSING" || msg.includes("VIDEO_WORKER_MISSING") || msg.includes("VIDEO_WORKER_URL absent")) {
    return Response.json({ error: msg, code: "VIDEO_WORKER_MISSING", falCalls: 0, falVideoCalls: 0 }, { status: 503 })
  }
  if (code === "PREMIUM_VIDEO_DISABLED" || msg.includes("PREMIUM_VIDEO_DISABLED")) {
    return Response.json({ error: msg, code: "PREMIUM_VIDEO_DISABLED", falCalls: 0, falVideoCalls: 0 }, { status: 409 })
  }
  if (code === "WORKFLOW_JSON_MISSING" || msg.includes("WORKFLOW_JSON_MISSING")) {
    return Response.json({ error: msg, code: "WORKFLOW_JSON_MISSING", falCalls: 0 }, { status: 409 })
  }
  return null
}
