"use client"

import { useState } from "react"
import { generateSubtitlesForScene } from "@/lib/subtitleUtils"

export default function SubtitleEditor({ scene, languages, onUpdate }) {
  const [activeLang, setActiveLang] = useState(languages[0] || "en")
  const subtitles = scene.subtitles || {}
  const chunks = subtitles[activeLang] || []

  function handleAutoGenerate() {
    const generated = generateSubtitlesForScene(scene, languages)
    onUpdate({ subtitles: { ...subtitles, ...generated } })
  }

  function handleAutoGenerateLang() {
    const generated = generateSubtitlesForScene(scene, [activeLang])
    onUpdate({ subtitles: { ...subtitles, ...generated } })
  }

  function updateChunk(chunkIndex, field, value) {
    const updated = chunks.map((c, i) =>
      i === chunkIndex ? { ...c, [field]: value } : c
    )
    onUpdate({ subtitles: { ...subtitles, [activeLang]: updated } })
  }

  function removeChunk(chunkIndex) {
    const updated = chunks.filter((_, i) => i !== chunkIndex)
    onUpdate({ subtitles: { ...subtitles, [activeLang]: updated } })
  }

  function addChunk() {
    const lastEnd = chunks.length > 0 ? chunks[chunks.length - 1].endSec : 0
    const sceneEnd = scene.duration_sec || 5
    const newStart = Math.min(lastEnd + 0.15, sceneEnd)
    const newEnd = Math.min(newStart + 2, sceneEnd)
    const updated = [...chunks, { text: "", startSec: Math.round(newStart * 100) / 100, endSec: Math.round(newEnd * 100) / 100 }]
    onUpdate({ subtitles: { ...subtitles, [activeLang]: updated } })
  }

  function clearSubtitles() {
    const updated = { ...subtitles }
    delete updated[activeLang]
    onUpdate({ subtitles: updated })
  }

  // Validation: check overlaps and out-of-bounds
  function getWarnings() {
    const warns = []
    const dur = scene.duration_sec || 5
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      if (c.endSec > dur) warns.push(`Chunk ${i + 1} exceeds scene duration (${dur}s)`)
      if (c.startSec >= c.endSec) warns.push(`Chunk ${i + 1} has invalid timing`)
      if (i > 0 && c.startSec < chunks[i - 1].endSec) warns.push(`Chunk ${i + 1} overlaps with chunk ${i}`)
    }
    return warns
  }

  const warnings = getWarnings()

  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-2">
        <span className="text-xs font-semibold text-text-muted">Subtitles</span>
        <div className="flex items-center gap-1.5">
          {chunks.length > 0 && (
            <button
              onClick={clearSubtitles}
              className="px-2 py-0.5 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={handleAutoGenerateLang}
            className="px-2 py-0.5 text-xs text-accent hover:text-accent-hover transition-colors"
            title={`Auto-generate subtitles for ${activeLang.toUpperCase()}`}
          >
            Auto ({activeLang.toUpperCase()})
          </button>
          <button
            onClick={handleAutoGenerate}
            className="px-2 py-1 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded transition-colors font-medium"
          >
            Auto All
          </button>
        </div>
      </div>

      {/* Language tabs */}
      <div className="flex gap-1 px-3 pt-2">
        {languages.map((lang) => {
          const hasChunks = subtitles[lang]?.length > 0
          return (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                activeLang === lang
                  ? "bg-accent/20 text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {lang.toUpperCase()}
              {hasChunks && <span className="ml-0.5 text-green-400">*</span>}
            </button>
          )
        })}
      </div>

      {/* Chunks */}
      <div className="p-3 space-y-2">
        {chunks.length === 0 ? (
          <div className="text-center py-3 text-xs text-text-muted">
            No custom subtitles. Using auto-generation.
            <br />
            <button
              onClick={handleAutoGenerateLang}
              className="mt-1 text-accent hover:text-accent-hover transition-colors"
            >
              Generate editable subtitles
            </button>
          </div>
        ) : (
          <>
            {chunks.map((chunk, i) => (
              <div key={i} className="flex items-start gap-2 group">
                <span className="text-xs text-text-muted mt-2 w-4 text-right flex-shrink-0">{i + 1}</span>
                <div className="flex-1 flex gap-1.5">
                  <input
                    type="text"
                    value={chunk.text}
                    onChange={(e) => updateChunk(i, "text", e.target.value)}
                    dir={activeLang === "ar" ? "rtl" : "ltr"}
                    placeholder="Subtitle text..."
                    className="flex-1 px-2 py-1.5 bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={scene.duration_sec || 15}
                    value={chunk.startSec}
                    onChange={(e) => updateChunk(i, "startSec", Number(e.target.value))}
                    className="w-16 px-1.5 py-1.5 bg-surface border border-border rounded text-xs text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    title="Start (sec)"
                  />
                  <span className="text-xs text-text-muted self-center">-</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={scene.duration_sec || 15}
                    value={chunk.endSec}
                    onChange={(e) => updateChunk(i, "endSec", Number(e.target.value))}
                    className="w-16 px-1.5 py-1.5 bg-surface border border-border rounded text-xs text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    title="End (sec)"
                  />
                  <button
                    onClick={() => removeChunk(i)}
                    className="px-1.5 py-1.5 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove chunk"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            {/* Add chunk */}
            <button
              onClick={addChunk}
              className="w-full py-1.5 border border-dashed border-border rounded text-xs text-text-muted hover:text-accent hover:border-accent transition-colors"
            >
              + Add Chunk
            </button>
          </>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-400">{w}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
