"use client"

import { useState } from "react"
import { ensureReadableDurations } from "@/lib/subtitleUtils"

export function useExport() {
  const [statuses, setStatuses] = useState({})   // { lang: 'idle'|'exporting'|'done'|'error' }
  const [downloadUrls, setDownloadUrls] = useState({}) // { lang: objectUrl }
  const [progresses, setProgresses] = useState({})     // { lang: 0-100 }
  const [errors, setErrors] = useState({})

  async function exportVideo({ scenes: rawScenes, images, language, isRtl, watermark, watermarkText, watermarkSize, watermarkColor, watermarkOpacity, musicUrl = null, musicVolume = 1.0, dubScenes = null, defaultDubLang = null, subtitleEnabled = true, subtitleSize = 62 }) {
    setStatuses((prev) => ({ ...prev, [language]: "exporting" }))
    setErrors((prev) => ({ ...prev, [language]: null }))

    const scenes = ensureReadableDurations(rawScenes, language)

    try {
      // Convert blob URLs to base64 data URLs (blob URLs can't be accessed by server-side renderer)
      const imageUrls = await Promise.all(
        scenes.map(async (_, i) => {
          const url = images[i]?.url
          if (!url) return null
          if (url.startsWith("data:")) return url
          if (url.startsWith("blob:")) {
            const res = await fetch(url)
            const blob = await res.blob()
            return new Promise((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result)
              reader.readAsDataURL(blob)
            })
          }
          return url
        })
      )

      // Start the async export job
      const startRes = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes, imageUrls, language, isRtl, watermark, watermarkText, watermarkSize, watermarkColor, watermarkOpacity, musicUrl, musicVolume, dubScenes, defaultDubLang, subtitleEnabled, subtitleSize }),
      })

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}))
        throw new Error(err.error || `Export failed (${startRes.status})`)
      }

      const { jobId } = await startRes.json()

      // Poll until done (max 60 min)
      const MAX_POLL_MS = 60 * 60 * 1000
      const pollStart = Date.now()
      while (true) {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          throw new Error("Export timed out after 60 minutes. Please try again.")
        }

        await new Promise((r) => setTimeout(r, 5000))

        const pollRes = await fetch(`/api/admin/export/${jobId}`)

        if (!pollRes.ok) {
          throw new Error(`Poll failed (${pollRes.status})`)
        }

        const status = await pollRes.json()
        if (status.status === "done") {
          setDownloadUrls((prev) => ({ ...prev, [language]: `/api/admin/export/${jobId}?download=1` }))
          setStatuses((prev) => ({ ...prev, [language]: "done" }))
          return
        }

        if (status.status === "error") {
          throw new Error(status.error || "Export failed")
        }

        if (status.progress !== undefined) {
          setProgresses((prev) => ({ ...prev, [language]: status.progress }))
        }
        // still pending or rendering — keep polling
      }
    } catch (err) {
      setErrors((prev) => ({ ...prev, [language]: err.message }))
      setStatuses((prev) => ({ ...prev, [language]: "error" }))
    }
  }

  function reset(language) {
    const url = downloadUrls[language]
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url)
    }
    setStatuses((prev) => ({ ...prev, [language]: "idle" }))
    setDownloadUrls((prev) => {
      const next = { ...prev }
      delete next[language]
      return next
    })
    setErrors((prev) => ({ ...prev, [language]: null }))
    setProgresses((prev) => {
      const next = { ...prev }
      delete next[language]
      return next
    })
  }

  return { statuses, downloadUrls, progresses, errors, exportVideo, reset }
}
