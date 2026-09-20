export function sceneCount(episode) {
  const scenes = episode?.screenplay?.scenes
  return Array.isArray(scenes) ? scenes.length : 0
}

export function episodeIsPopulated(episode) {
  return sceneCount(episode) > 0
}

export function episodeIsWatchable(episode, hasRender) {
  return episodeIsPopulated(episode) && Boolean(hasRender)
}

/** Incomplete episodes with no scenes still belong in the creation wizard. */
export function shouldRedirectToWizard(episode) {
  if (!episode) return true
  if (episodeIsPopulated(episode)) return false
  return episode.status !== "completed"
}

export function episodeCardAction(episode, hasRender) {
  if (episodeIsWatchable(episode, hasRender)) return "watch"
  if (episode.status === "completed" || episodeIsPopulated(episode)) return "view"
  return "continue"
}

export function seriesPrimaryAction(episodes, rendersById = {}) {
  const list = Array.isArray(episodes) ? episodes : []
  const watch = list.find((ep) => episodeIsWatchable(ep, rendersById[ep.id]))
  if (watch) return { type: "watch", episode: watch }
  const populated = list.find(episodeIsPopulated)
  if (populated) return { type: "view", episode: populated }
  const inProgress = list.find((e) => e.status !== "completed")
  if (inProgress) return { type: "continue", episode: inProgress }
  return { type: "create" }
}

export function episodeDurationSec(episode) {
  const scenes = episode?.screenplay?.scenes
  if (!Array.isArray(scenes)) return 0
  return scenes.reduce((sum, scene) => sum + (Number(scene?.duration_sec) || 0), 0)
}

export function episodeHasAudio(episode) {
  const dub = episode?.dubScenes
  if (!dub || typeof dub !== "object") return false
  const values = Object.values(dub)
  if (values.length === 0) return false
  const first = values[0]
  if (first && typeof first === "object" && ("url" in first || "path" in first || "durationSec" in first)) {
    return true
  }
  return values.some((langMap) => langMap && typeof langMap === "object" && Object.keys(langMap).length > 0)
}

export function isUsableEpisodeStill(url) {
  if (!url || typeof url !== "string") return false
  if (/test[-_]?stills?|test still/i.test(url)) return false
  return true
}

export function episodeBlurb(episode) {
  if (episode?.summary) return String(episode.summary).trim()
  if (episode?.direction) return String(episode.direction).trim()
  const scene = episode?.screenplay?.scenes?.[0]
  if (!scene || typeof scene !== "object") return ""
  return String(scene.text_es || scene.text_en || scene.visual_description || "").trim()
}

export function episodeCardCtaLabel(action) {
  if (action === "watch") return "Watch Episode"
  if (action === "view") return "Open Episode"
  return "Continue Visuals"
}

export function episodePipelineLabels({ hasStill, hasAudio, hasRender }) {
  return {
    visual: hasStill ? "Visuals ready" : "Visuals pending",
    audio: hasAudio ? "Audio ready" : "Audio pending",
    video: hasRender ? "Video ready" : "Video pending",
  }
}
