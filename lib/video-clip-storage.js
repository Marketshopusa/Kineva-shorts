export const MINIMAX_RENDER_FILENAME = "episode-1-minimax-v1.mp4"
export const MOTION_RENDER_FILENAME = "episode-1-motion-v1.mp4"
export const LEGACY_ANIMATIC_FILENAME = "episode-1.mp4"

export function episodeRenderPrefix(seriesId, episodeId) {
  return `series/${Number(seriesId)}/episodes/${Number(episodeId)}`
}

export function minimaxRenderPath(seriesId, episodeId) {
  return `${episodeRenderPrefix(seriesId, episodeId)}/${MINIMAX_RENDER_FILENAME}`
}

export function motionRenderPath(seriesId, episodeId) {
  return `${episodeRenderPrefix(seriesId, episodeId)}/${MOTION_RENDER_FILENAME}`
}

export function legacyAnimaticPath(seriesId, episodeId) {
  if (Number(seriesId) === 1 && Number(episodeId) === 1) {
    return `${episodeRenderPrefix(seriesId, episodeId)}/kineva-demo.mp4`
  }
  return `${episodeRenderPrefix(seriesId, episodeId)}/${LEGACY_ANIMATIC_FILENAME}`
}

export function clipPrefix(seriesId, episodeId) {
  return `${episodeRenderPrefix(seriesId, episodeId)}/clips`
}

export function clipPath(seriesId, episodeId, shotId) {
  const id = String(shotId || "").replace(/[^a-z0-9-]/gi, "") || "shot"
  return `${clipPrefix(seriesId, episodeId)}/${id}.mp4`
}

export function shotPlanPath(seriesId, episodeId) {
  return `${clipPrefix(seriesId, episodeId)}/shot-plan.json`
}

export function jobPath(seriesId, episodeId, jobId) {
  const id = String(jobId || "").replace(/[^a-z0-9._-]/gi, "") || "job"
  return `${clipPrefix(seriesId, episodeId)}/jobs/${id}.json`
}

export function isClipObjectPath(seriesId, episodeId, storagePath) {
  const prefix = `${clipPrefix(seriesId, episodeId)}/`
  return typeof storagePath === "string"
    && storagePath.startsWith(prefix)
    && /shot-\d{2}\.mp4$/.test(storagePath)
}

export function isMotionObjectPath(seriesId, episodeId, storagePath) {
  return storagePath === motionRenderPath(seriesId, episodeId)
}

export function isLegacyAnimaticPath(seriesId, episodeId, storagePath) {
  return storagePath === legacyAnimaticPath(seriesId, episodeId)
    || storagePath === `${episodeRenderPrefix(seriesId, episodeId)}/${LEGACY_ANIMATIC_FILENAME}`
}

export function isAllowedRenderObjectPath(seriesId, episodeId, storagePath) {
  const path = String(storagePath || "")
  if (isMotionObjectPath(seriesId, episodeId, path)) return true
  if (path === minimaxRenderPath(seriesId, episodeId)) return true
  if (isLegacyAnimaticPath(seriesId, episodeId, path)) return true
  if (isClipObjectPath(seriesId, episodeId, path)) return true
  if (path === shotPlanPath(seriesId, episodeId)) return true
  if (path.startsWith(`${clipPrefix(seriesId, episodeId)}/jobs/`) && path.endsWith(".json")) return true
  if (path === `${episodeRenderPrefix(seriesId, episodeId)}/kineva-demo.mp4`) return true
  return false
}

export function classifyRenderVersion(storagePath) {
  const path = String(storagePath || "")
  if (path.endsWith(`/${MINIMAX_RENDER_FILENAME}`)) return "minimax"
  if (path.endsWith(`/${MOTION_RENDER_FILENAME}`)) return "motion"
  if (path.endsWith(`/${LEGACY_ANIMATIC_FILENAME}`) || path.endsWith("/kineva-demo.mp4")) return "legacy"
  if (/\/clips\/shot-\d{2}\.mp4$/.test(path)) return "clip"
  return "unknown"
}
