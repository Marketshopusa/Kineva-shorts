"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api"
import { buildImagePrompt, getSceneCharacterReferences } from "@/lib/buildImagePrompt"
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
      const provider = series.contentRail?.imageProvider || rail.imageProvider

      let visualDescription = scene.visual_description
      const promptData = await apiFetch("/api/admin/generate-prompt", {
        method: "POST",
        body: JSON.stringify({
          scene_text: scene[`text_${series.languages?.[0] || "en"}`] || "",
          scene_type: scene.type,
          theme: series.theme,
          visual_description: scene.visual_description,
          seriesId: series.id,
        }),
      })
      visualDescription = promptData.image_prompt

      const fullPrompt = buildImagePrompt({
        scene: { ...scene, visual_description: visualDescription },
        characters,
        series,
        maxLength: 0,
      })

      const endpoint = provider === "fal"
        ? "/api/admin/generate-image-fal"
        : "/api/admin/generate-image-gemini"

      const characterReferences = provider === "gemini"
        ? getSceneCharacterReferences(scene, characters)
        : []

      const imageData = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          prompt: fullPrompt,
          seriesId: series.id,
          provider,
          ...(characterReferences.length > 0 ? { characterReferences } : {}),
        }),
      })

      const imageEntry = {
        url: imageData.image_url,
        prompt: fullPrompt,
        approved: autoApprove,
        provider,
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
    const active = new Map() // id -> promise
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
