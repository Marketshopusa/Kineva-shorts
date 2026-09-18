"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api"

export function useScreenplay() {
  const [scenes, setScenes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function generateScreenplay({ series, characters, episodeNumber, direction, previousScreenplay }) {
    setLoading(true)
    setError(null)

    try {
      const data = await apiFetch("/api/admin/screenplay", {
        method: "POST",
        body: JSON.stringify({ series, characters, episodeNumber, direction, previousScreenplay }),
      })
      setScenes(Array.isArray(data.scenes) ? data.scenes : [])
      return data.scenes
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  function updateScene(index, updates) {
    setScenes((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }

  return { scenes, setScenes, loading, error, generateScreenplay, updateScene }
}
