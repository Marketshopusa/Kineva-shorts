"use client"

import { useState, useEffect } from "react"
import SceneCard from "@/components/ui/SceneCard"
import { RotateCcw, Loader2, Zap, Mic2, Flame, GitBranch, Palette } from "lucide-react"

const SCORE_DIMS = [
  { key: "tension",    label: "Tension Arc",          icon: Flame,      desc: "Escalation across 6 scenes" },
  { key: "voice",      label: "Character Voice",       icon: Mic2,       desc: "Speech pattern consistency" },
  { key: "cliffhanger",label: "Cliffhanger",          icon: Zap,        desc: "Final scene impact" },
  { key: "continuity", label: "Continuity",            icon: GitBranch,  desc: "Previous cliffhanger & threads" },
  { key: "tone",       label: "Tonal Match",           icon: Palette,    desc: "Matches series tone" },
]

function scoreBadgeClass(v) {
  if (v >= 8) return "bg-green-500/15 text-green-400 border-green-500/30"
  if (v >= 6) return "bg-amber-500/15 text-amber-400 border-amber-500/30"
  return "bg-accent/15 text-accent border-accent/30"
}

function ScoreCard({ screenplay, series, characters, episodeId, previousCliffhanger, onRegenerateWithFeedback }) {
  const [state, setState] = useState("idle") // idle | loading | done | error
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!screenplay || !series) return
    setState("loading")
    fetch("/api/admin/screenplay-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenplay, series, characters, episodeId, previousCliffhanger }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setState("error")
        else { setResult(data); setState("done") }
      })
      .catch(() => setState("error"))
  }, []) // run once when scenes arrive

  if (state === "idle") return null

  if (state === "loading") {
    return (
      <div className="mb-6 p-4 bg-surface border border-border rounded-xl flex items-center gap-3 text-sm text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
        Analyzing screenplay quality...
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="mb-6 p-3 bg-surface border border-border rounded-xl text-xs text-text-muted">
        Quality analysis unavailable — continue editing or proceed.
      </div>
    )
  }

  const { scores, feedback, overall } = result

  // Build regeneration hint from the weakest dimension
  const weakest = SCORE_DIMS.reduce((a, b) =>
    (scores[a.key] ?? 10) <= (scores[b.key] ?? 10) ? a : b
  )
  const regenHint = `Improve: ${feedback?.[weakest.key] || "strengthen " + weakest.label}`

  const overallColor = overall >= 8 ? "text-green-400" : overall >= 6 ? "text-amber-400" : "text-accent"

  return (
    <div className="mb-6 p-4 bg-surface border border-border rounded-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">Screenplay Quality</div>
        <div className={`text-2xl font-bold tabular-nums ${overallColor}`}>
          {overall}<span className="text-sm font-normal text-text-muted">/10</span>
        </div>
      </div>

      {/* Score grid */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        {SCORE_DIMS.map(({ key, label, icon: Icon, desc }) => {
          const val = scores?.[key]
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-text-muted">
                <Icon className="w-3 h-3 shrink-0" />
                {label}
              </div>
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-sm font-semibold ${scoreBadgeClass(val)}`}>
                {val}/10
              </div>
              <p className="text-[10px] text-text-muted leading-tight">{feedback?.[key]}</p>
            </div>
          )
        })}
      </div>

      {/* Regenerate with feedback */}
      {onRegenerateWithFeedback && (
        <div className="pt-2 border-t border-card-border flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted flex-1">
            <span className="text-amber-400 font-medium">Weakest: {weakest.label}</span>
            {" — "}
            {feedback?.[weakest.key]}
          </p>
          <button
            onClick={() => onRegenerateWithFeedback(regenHint)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-card-border text-xs text-text-muted hover:text-accent hover:border-accent/30 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Regenerate with feedback
          </button>
        </div>
      )}
    </div>
  )
}

export default function ScreenplayStep({
  scenes, languages, onUpdateScene, onNext, onBack, onResetStep, onRegenerate,
  // new props for scoring
  series, characters, episodeId, previousCliffhanger, onRegenerateWithFeedback,
}) {
  if (!scenes) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-serif font-bold">Screenplay</h2>
        <div className="text-sm text-text-muted">
          {scenes.length} scenes &middot; {scenes.reduce((sum, s) => sum + (s.duration_sec || 0), 0)}s total
        </div>
      </div>

      {/* Quality Score Card */}
      <ScoreCard
        screenplay={scenes}
        series={series}
        characters={characters}
        episodeId={episodeId}
        previousCliffhanger={previousCliffhanger}
        onRegenerateWithFeedback={onRegenerateWithFeedback}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {scenes.map((scene, i) => (
          <SceneCard
            key={i}
            scene={scene}
            index={i}
            languages={languages}
            onUpdate={onUpdateScene}
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
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-card-border text-text-muted hover:text-accent hover:border-accent/30 rounded-lg text-sm transition-colors"
              title="Regenerate the entire screenplay from scratch"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          )}
        </div>
        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
        >
          Next: Generate Visuals
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
