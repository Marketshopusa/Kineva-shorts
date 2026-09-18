"use client"

import { useState, useEffect, useRef } from "react"
import VisualCard from "@/components/ui/VisualCard"
import StylePicker from "@/components/ui/StylePicker"
import { getVisualStyle } from "@/config/visualStyles"
import { RotateCcw, RefreshCw, ChevronDown } from "lucide-react"

export default function VisualStep({
  scenes, images, statuses, characters, series, episodeNumber,
  onGenerateImage, onGenerateAll, onApprove,
  onNext, onBack, error, onResetStep,
}) {
  const [provider, setProvider] = useState("gemini")
  const [autoApprove, setAutoApprove] = useState(true)
  const userPickedProvider = useRef(false)

  // Load default provider from settings on mount — but never override a manual selection
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.defaultImageProvider && !userPickedProvider.current) {
          setProvider(data.defaultImageProvider)
        }
      })
      .catch(() => {})
  }, [])
  const [showStyleOverride, setShowStyleOverride] = useState(false)
  const [styleOverride, setStyleOverride] = useState(null) // null = use series default

  if (!scenes) return null

  const activeStyleKey = styleOverride || series?.visualStyle || "cinematic"
  const activeStyle = getVisualStyle(activeStyleKey)

  const total = scenes.length
  const doneCount  = scenes.filter((_, i) => statuses[i] === "done").length
  const errorCount = scenes.filter((_, i) => statuses[i] === "error").length
  const allGenerated = doneCount === total
  const approvedCount = Object.values(images).filter((img) => img?.approved).length
  const allApproved  = approvedCount === total
  const anyGenerating = Object.values(statuses).some((s) => s === "generating")
  const canProceed = autoApprove ? allGenerated : allApproved

  const failedIndices = scenes
    .map((_, i) => i)
    .filter((i) => statuses[i] === "error")

  // Build a series-with-override object for image generation
  const seriesWithStyle = { ...series, visualStyle: activeStyleKey }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-serif font-bold">Visual Generation</h2>
        <div className="flex items-center gap-3">
          {/* Provider toggle */}
          <div className="flex bg-surface border border-border rounded-lg overflow-hidden">
            {[
              { id: "gemini", label: "Gemini" },
              { id: "qwen", label: "Qwen" },
              { id: "openai", label: "GPT Image" },
              { id: "leonardo", label: "Leonardo" },
              { id: "leonardo-nano", label: "Leo Nano" },
              { id: "leonardo-gpt2", label: "Leo GPT2" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { userPickedProvider.current = true; setProvider(id) }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  provider === id ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onGenerateAll(provider, autoApprove, seriesWithStyle)}
            disabled={anyGenerating}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {anyGenerating ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              "Generate All"
            )}
          </button>
        </div>
      </div>

      {/* Active visual style badge + override toggle */}
      <div className="mb-4 p-3 bg-surface border border-border rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{activeStyle.emoji}</span>
            <div>
              <div className="text-sm font-medium text-text-primary">
                {activeStyle.name}
                {styleOverride && styleOverride !== series?.visualStyle && (
                  <span className="ml-2 text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">episode override</span>
                )}
              </div>
              <div className="text-xs text-text-muted">{activeStyle.description}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowStyleOverride((v) => !v)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
          >
            Change
            <ChevronDown className={`w-3 h-3 transition-transform ${showStyleOverride ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Collapsible style override picker */}
        {showStyleOverride && (
          <div className="mt-3 pt-3 border-t border-card-border">
            <p className="text-xs text-text-muted mb-2">Override visual style for this episode only</p>
            <StylePicker
              value={activeStyleKey}
              onChange={(key) => {
                setStyleOverride(key)
                setShowStyleOverride(false)
              }}
              compact
            />
            {styleOverride && (
              <button
                type="button"
                onClick={() => setStyleOverride(null)}
                className="mt-2 text-xs text-text-muted hover:text-accent transition-colors"
              >
                Reset to series default ({getVisualStyle(series?.visualStyle).name})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Auto-approve toggle */}
      <label className="flex items-center gap-3 mb-4 p-3 bg-surface border border-border rounded-xl cursor-pointer select-none">
        <div
          onClick={() => setAutoApprove((v) => !v)}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${autoApprove ? "bg-accent" : "bg-card-border"}`}
        >
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${autoApprove ? "translate-x-4" : ""}`} />
        </div>
        <div>
          <p className="text-sm font-medium">Auto-approve generated images</p>
          <p className="text-xs text-text-muted mt-0.5">Images are approved automatically — you can still regenerate any individual scene</p>
        </div>
      </label>

      {/* Progress bar */}
      {(anyGenerating || doneCount > 0) && (
        <div className="mb-4 p-3 bg-surface border border-border rounded-xl">
          <div className="flex items-center justify-between text-xs text-text-muted mb-2">
            <span>Generating images: {doneCount}/{total} complete{errorCount > 0 ? `, ${errorCount} failed` : ""}</span>
            <span>{Math.round((doneCount / total) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${(doneCount / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {scenes.map((scene, i) => (
          <VisualCard
            key={i}
            scene={scene}
            sceneIndex={i}
            image={images[i]}
            status={statuses[i]}
            onGenerate={(scene, idx) => onGenerateImage(scene, idx, provider, autoApprove, seriesWithStyle)}
            onApprove={onApprove}
            characters={characters}
            episodeNumber={episodeNumber}
          />
        ))}
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-5 py-2.5 border border-border text-text-muted hover:text-text-primary rounded-lg transition-colors"
          >
            Back
          </button>
          {/* Retry failed button */}
          {failedIndices.length > 0 && !anyGenerating && (
            <button
              onClick={() => failedIndices.forEach((i) => onGenerateImage(scenes[i], i, provider, autoApprove, seriesWithStyle))}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-card-border text-text-muted hover:text-accent hover:border-accent/30 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry {failedIndices.length} Failed
            </button>
          )}
        </div>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {canProceed
            ? "Next: Preview"
            : autoApprove
              ? `Generating images (${doneCount}/${total})`
              : `Approve all images (${approvedCount}/${total})`}
        </button>
      </div>

      {onResetStep && (
        <div className="mt-4 pt-4 border-t border-card-border">
          <button
            onClick={onResetStep}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset this step
          </button>
        </div>
      )}
    </div>
  )
}
