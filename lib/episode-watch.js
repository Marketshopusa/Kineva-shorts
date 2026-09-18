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
