"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api"
import { buildSceneVisualPrompt } from "@/lib/buildSceneVisualPrompt"
import { resolveContentRail } from "@/lib/content-rails"

export function useVisuals() {
  const [images, setImages] = useState({})       // { sceneIndex: { url, prompt, approved } }
  const [statuses, setStatuses] = useState({})    // { sceneIndex: 'idle'|'generating'|'done'|'error' }
  const [error, setError] = useState(null)

  function setStatus(index, status) {
    setStatuses((prev) => ({ ...prev, [index]: status }))
  }

  async function generateImage(scene, sceneIndex, characters, series, _ignoredProvider, autoApprove = false) {
    setStatus(sceneIndex, "generating")
    setError(null)

    try {
      const rail = resolveContentRail(series.contentRating)
      const provider = rail.imageProvider

      const planned = buildSceneVisualPrompt({
        scene,
        characters,
        series,
        maxLength: 0,
      })

      const endpoint = provider === "fal"
        ? "/api/admin/generate-image-fal"
        : "/api/admin/generate-image-gemini"

      const imageData = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          prompt: planned.prompt,
          seriesId: series.id,
          provider,
          referenceImageUrl: planned.referenceImageUrl,
          aspectRatio: "9:16",
          metadata: { sceneIndex, characterIds: planned.characterIds },
        }),
      })

      const imageEntry = {
        url: imageData.image_url,
        prompt: planned.prompt,
        approved: autoApprove,
        provider,
        referenceImageUrl: planned.referenceImageUrl,
        route: planned.route,
      }
      setImages((prev) => ({ ...prev, [sceneIndex]: imageEntry }))
      setStatus(sceneIndex, "done")
      return imageEntry
    } catch (err) {
      setError(err.message)
      setStatus(sceneIndex, "error")
    }
  }

  async function generateAll(scenes, characters, series, provider = "gemini", autoApprove = false) {
    const CONCURRENCY = 4
    const queue = scenes.map((scene, i) => ({ scene, index: i }))
    const active = new Map()
    let nextId = 0

    while (queue.length > 0 || active.size > 0) {
      while (active.size < CONCURRENCY && queue.length > 0) {
        const { scene, index } = queue.shift()
        const id = nextId++
        const promise = generateImage(scene, index, characters, series, provider, autoApprove).then(() => id)
        active.set(id, promise)
      }

      if (active.size > 0) {
        const doneId = await Promise.race(active.values())
        active.delete(doneId)
      }
    }
  }

  function approveImage(sceneIndex) {
    setImages((prev) => ({
      ...prev,
      [sceneIndex]: { ...prev[sceneIndex], approved: true },
    }))
  }

  function unapproveImage(sceneIndex) {
    setImages((prev) => ({
      ...prev,
      [sceneIndex]: { ...prev[sceneIndex], approved: false },
    }))
  }

  return { images, setImages, statuses, error, generateImage, generateAll, approveImage, unapproveImage }
}
