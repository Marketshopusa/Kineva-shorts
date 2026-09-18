/**
 * Split scene narration text into timed subtitle chunks.
 *
 * @param {string} text       Full narration text for a scene
 * @param {number} durationSec Scene duration in seconds
 * @param {number} fps        Frames per second (default 30)
 * @returns {Array<{ text: string, startSec: number, endSec: number, startFrame: number, endFrame: number }>}
 */
export function splitIntoChunks(text, durationSec, fps = 30) {
  if (!text || !durationSec) return []

  const MAX_WORDS = 8

  // Recursively split until every piece is ≤ MAX_WORDS
  function splitPiece(piece) {
    const words = piece.trim().split(/\s+/)
    if (words.length <= MAX_WORDS) return [piece.trim()]
    // Prefer a comma split near the centre for natural phrasing
    const commaIdx = piece.indexOf(",", Math.floor(piece.length * 0.25))
    if (commaIdx > 0 && commaIdx < piece.length * 0.75) {
      return [
        ...splitPiece(piece.slice(0, commaIdx + 1).trim()),
        ...splitPiece(piece.slice(commaIdx + 1).trim()),
      ]
    }
    // Fall back to word-midpoint split
    const mid = Math.ceil(words.length / 2)
    return [
      ...splitPiece(words.slice(0, mid).join(" ")),
      ...splitPiece(words.slice(mid).join(" ")),
    ]
  }

  // Split on sentence boundaries then recursively limit each piece
  const chunks = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(splitPiece)

  if (chunks.length === 0) return []

  // Distribute time proportionally by word count
  const totalWords = chunks.reduce((sum, c) => sum + c.split(/\s+/).length, 0)
  const GAP = 0.15 // small gap between chunks
  const totalGaps = (chunks.length - 1) * GAP
  const availableDuration = Math.max(durationSec - totalGaps, durationSec * 0.8)

  const MIN_CHUNK_SEC = 1.2 // shorter chunks need less minimum time

  // Two-pass allocation: proportional first, then redistribute surplus from long
  // chunks to fund the minimums for short ones — avoids overflow entirely.
  const proportional = chunks.map((chunk) =>
    (chunk.split(/\s+/).length / totalWords) * availableDuration
  )

  const deficit = proportional.reduce((sum, d) => sum + Math.max(0, MIN_CHUNK_SEC - d), 0)
  const surplus = proportional.reduce((sum, d) => sum + Math.max(0, d - MIN_CHUNK_SEC), 0)
  const surplusScale = surplus > 0 ? 1 - deficit / surplus : 1

  const durations = proportional.map((d) =>
    d <= MIN_CHUNK_SEC ? MIN_CHUNK_SEC : MIN_CHUNK_SEC + (d - MIN_CHUNK_SEC) * surplusScale
  )

  let currentTime = 0
  return chunks.map((chunk, i) => {
    const startSec = currentTime
    const endSec = Math.min(currentTime + durations[i], durationSec)
    currentTime = endSec + (i < chunks.length - 1 ? GAP : 0)
    return {
      text: chunk,
      startSec,
      endSec,
      startFrame: Math.round(startSec * fps),
      endFrame: Math.round(endSec * fps),
    }
  })
}

/**
 * Get the active subtitle chunk for a given time in seconds.
 */
export function getActiveChunk(chunks, timeSec) {
  return chunks.find((c) => timeSec >= c.startSec && timeSec < c.endSec) || null
}

/**
 * Get the active subtitle chunk for a given frame number.
 */
export function getActiveChunkByFrame(chunks, frame) {
  return chunks.find((c) => frame >= c.startFrame && frame < c.endFrame) || null
}

/**
 * Calculate total frames for an array of scenes.
 * Pass dubScenes ({ "0": { durationSec } }) to account for extended dub durations.
 */
export function calculateTotalFrames(scenes, fps = 30, transitionFrames = 15, dubScenes = null) {
  if (!scenes?.length) return 0
  const scenesFrames = scenes.reduce((sum, s, i) => {
    const base = (s.duration_sec || 5) * fps
    const dubInfo = dubScenes?.[String(i)]
    const dubSec = typeof dubInfo === "object" && dubInfo !== null ? dubInfo.durationSec : null
    const effective = dubSec ? Math.max(base, Math.ceil(dubSec * fps)) : base
    return sum + effective
  }, 0)
  const transitions = (scenes.length - 1) * transitionFrames
  return scenesFrames + transitions
}

/**
 * Get the frame offset where a scene starts within the full composition.
 * Pass dubScenes to account for extended dub durations.
 */
export function getSceneStartFrame(scenes, sceneIndex, fps = 30, transitionFrames = 15, dubScenes = null) {
  let frame = 0
  for (let i = 0; i < sceneIndex; i++) {
    const base = (scenes[i].duration_sec || 5) * fps
    const dubInfo = dubScenes?.[String(i)]
    const dubSec = typeof dubInfo === "object" && dubInfo !== null ? dubInfo.durationSec : null
    const effective = dubSec ? Math.max(base, Math.ceil(dubSec * fps)) : base
    frame += effective + transitionFrames
  }
  return frame
}

/**
 * Adjust scene durations so subtitles are readable.
 * Reading speed: ~3 words/sec. Only increases durations, never decreases.
 *
 * @param {Array} scenes  Array of scene objects
 * @param {string} language  Language code (e.g. "en")
 * @returns {Array} New scenes array with adjusted duration_sec
 */
/**
 * Generate subtitle chunks for a scene across all languages.
 * Returns an object like { en: [{text, startSec, endSec}], tr: [...] }
 */
export function generateSubtitlesForScene(scene, languages, fps = 30) {
  const subtitles = {}
  for (const lang of languages) {
    const text = scene[`text_${lang}`] || ""
    const chunks = splitIntoChunks(text, scene.duration_sec || 5, fps)
    subtitles[lang] = chunks.map(({ text, startSec, endSec }) => ({
      text,
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
    }))
  }
  return subtitles
}

export function ensureReadableDurations(scenes, language) {
  if (!scenes?.length) return scenes

  const textKey = `text_${language}`

  return scenes.map((scene) => {
    const text = scene[textKey] || ""
    const wordCount = text.split(/\s+/).filter(Boolean).length
    if (wordCount === 0) return scene

    // Estimate chunks based on 8-word cap for gap padding
    const estimatedChunks = Math.ceil(wordCount / 8)
    const chunkTransitionPadding = Math.max(estimatedChunks - 1, 0) * 0.3

    // 3 words/sec reading speed + padding
    const minDuration = wordCount / 3 + chunkTransitionPadding

    const currentDuration = scene.duration_sec || 5
    if (minDuration > currentDuration) {
      return { ...scene, duration_sec: Math.ceil(minDuration) }
    }
    return scene
  })
}
