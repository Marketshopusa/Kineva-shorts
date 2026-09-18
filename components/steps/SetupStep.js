"use client"

import { useEffect, useRef, useState } from "react"
import { getThemeById } from "@/config/themes"
import { getVisualStyle } from "@/config/visualStyles"
import { RotateCcw, Sparkles, Loader2 } from "lucide-react"

const AUTOPILOT_STAGES = [
  { key: "screenplay", label: "Generating screenplay" },
  { key: "images",     label: "Generating images" },
  { key: "summarize",  label: "Summarizing" },
  { key: "finalize",   label: "Publishing" },
  { key: "done",       label: "Done!" },
]

export default function SetupStep({
  series,
  direction,
  onDirectionChange,
  onDirectionBlur,
  onGenerate,
  loading,
  error,
  characters,
  episodeNumber,
  onResetStep,
  previousScreenplay,
  onAutoPilotDone,
}) {
  const theme = getThemeById(series?.theme)
  const canGenerate = characters?.length > 0

  // Elapsed timer while generating
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)

  // Direction suggestions
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState([])

  // Auto-pilot state
  const [autoPilot, setAutoPilot] = useState(false)
  const [apStage, setApStage] = useState(null)       // current stage key
  const [apMessage, setApMessage] = useState("")
  const [apError, setApError] = useState(null)
  const [apImagesDone, setApImagesDone] = useState(0)
  const [apScore, setApScore] = useState(null)
  const [provider, setProvider] = useState("gemini")

  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [loading])

  async function handleSuggest() {
    setSuggesting(true)
    setSuggestions([])
    try {
      const res = await fetch("/api/admin/suggest-direction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          series,
          characters,
          episodeNumber,
          lastCliffhanger: series?.lastCliffhanger,
          ongoingPlotThreads: series?.ongoingPlotThreads,
        }),
      })
      const data = await res.json()
      if (data.suggestions) setSuggestions(data.suggestions)
    } catch {
      // silent fail — suggestions are optional
    } finally {
      setSuggesting(false)
    }
  }

  async function handleAutoPilot() {
    setAutoPilot(true)
    setApError(null)
    setApStage("screenplay")
    setApMessage("Generating screenplay...")
    setApImagesDone(0)

    const res = await fetch("/api/admin/auto-episode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        series,
        characters,
        episodeNumber,
        direction,
        previousScreenplay,
        provider,
      }),
    })

    if (!res.ok || !res.body) {
      setApError("Failed to start auto-pilot")
      setAutoPilot(false)
      return
    }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      // Parse SSE events from buffer
      const blocks = buf.split("\n\n")
      buf = blocks.pop() // keep incomplete block
      for (const block of blocks) {
        const eventMatch = block.match(/^event: (\w+)/)
        const dataMatch  = block.match(/^data: (.+)$/m)
        if (!eventMatch || !dataMatch) continue
        const evt  = eventMatch[1]
        let data = {}
        try { data = JSON.parse(dataMatch[1]) } catch { continue }

        if (evt === "stage")    { setApStage(data.stage); setApMessage(data.message) }
        if (evt === "image_done") { setApImagesDone(data.done) }
        if (evt === "score")    { setApScore(data.score) }
        if (evt === "error")    { setApError(data.message); setAutoPilot(false); return }
        if (evt === "done") {
          setApStage("done")
          setApMessage("Episode ready!")
          onAutoPilotDone?.(data.episodeId, data.seriesId)
          return
        }
      }
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-serif font-bold mb-6">Episode Setup</h2>

      {/* Series Context */}
      <div className="space-y-4 mb-8">
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-text-muted">Theme</span>
              <div className="font-medium mt-0.5">{theme?.icon} {theme?.name}</div>
            </div>
            <div>
              <span className="text-text-muted">Tone</span>
              <div className="font-medium mt-0.5">{series?.tone}</div>
            </div>
            <div>
              <span className="text-text-muted">Setting</span>
              <div className="font-medium mt-0.5">{series?.setting}</div>
            </div>
          </div>
        </div>

        {/* Previous Cliffhanger */}
        {series?.lastCliffhanger && (
          <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl">
            <div className="text-xs text-accent font-semibold mb-1">PREVIOUS CLIFFHANGER</div>
            <p className="text-sm">{series.lastCliffhanger}</p>
          </div>
        )}

        {/* Active Plot Threads */}
        {series?.ongoingPlotThreads?.length > 0 && (
          <div className="p-4 bg-surface border border-border rounded-xl">
            <div className="text-xs text-text-muted font-semibold mb-2">ACTIVE PLOT THREADS</div>
            <ul className="text-sm space-y-1">
              {series.ongoingPlotThreads.map((thread, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-accent">&bull;</span> {thread}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Characters */}
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="text-xs text-text-muted font-semibold mb-2">
            CHARACTERS ({characters?.length || 0})
          </div>
          {characters?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {characters.map((c) => (
                <span key={c.id} className="text-sm bg-surface-2 px-2 py-1 rounded">
                  {c.name} ({c.role})
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-accent">
              No characters defined. Go back and add characters before creating an episode.
            </p>
          )}
        </div>
      </div>

      {/* Episode Direction */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Episode Direction</label>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting || !characters?.length}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent border border-card-border hover:border-accent/30 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
          >
            {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Suggest
          </button>
        </div>
        <textarea
          value={direction}
          onChange={(e) => onDirectionChange(e.target.value)}
          onBlur={onDirectionBlur}
          placeholder="What should happen in this episode? e.g., Sarah confronts her father about the ledger."
          rows={3}
          className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
        />
        <p className="text-xs text-text-muted mt-1">
          Optional. Leave empty for Claude to continue the story naturally.
        </p>

        {/* Suggestion cards */}
        {suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Suggestions — click to use</p>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onDirectionChange(s); setSuggestions([]) }}
                className="w-full text-left p-3 bg-surface border border-card-border hover:border-accent/40 rounded-xl text-sm text-text-secondary hover:text-text-primary transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Format Info */}
      <div className="mb-6 p-4 bg-surface-2 rounded-xl text-sm text-text-muted">
        <div className="font-medium text-text-primary mb-2">Episode Format</div>
        <div className="grid grid-cols-4 gap-4">
          <div>6 scenes</div>
          <div>60-90 sec</div>
          <div>1080x1920</div>
          <div>Cliffhanger ending</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm">
          <p className="text-accent font-medium">Generation failed</p>
          <p className="text-accent/80 mt-0.5">{error}</p>
        </div>
      )}

      {/* Auto-pilot progress */}
      {autoPilot && (
        <div className="mb-6 p-4 glass rounded-xl space-y-3">
          <p className="text-sm font-semibold">Auto-Pilot Running</p>
          <div className="space-y-2">
            {AUTOPILOT_STAGES.filter((s) => s.key !== "done").map((stage) => {
              const stageIdx   = AUTOPILOT_STAGES.findIndex((s) => s.key === stage.key)
              const currentIdx = AUTOPILOT_STAGES.findIndex((s) => s.key === apStage)
              const isDone     = stageIdx < currentIdx || apStage === "done"
              const isActive   = stage.key === apStage
              const label = stage.key === "images" && apImagesDone > 0
                ? `${stage.label} (${apImagesDone}/6)`
                : stage.label
              return (
                <div key={stage.key} className={`flex items-center gap-2.5 text-sm ${isDone ? "text-green-400" : isActive ? "text-text-primary" : "text-text-muted"}`}>
                  {isDone ? (
                    <span className="w-4 h-4 flex items-center justify-center text-green-400">✓</span>
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-card-border shrink-0" />
                  )}
                  {label}
                </div>
              )
            })}
          </div>
          {/* Quality score (shown once screenplay stage completes) */}
          {apScore && (
            <div className="pt-2 border-t border-card-border">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-muted">Screenplay quality:</span>
                <span className={`font-semibold ${apScore.overall >= 8 ? "text-green-400" : apScore.overall >= 6 ? "text-amber-400" : "text-accent"}`}>
                  {apScore.overall}/10
                </span>
              </div>
            </div>
          )}
          {apStage === "done" && (
            <p className="text-sm text-green-400 font-medium">Episode created! Navigating...</p>
          )}
        </div>
      )}

      {apError && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent">
          Auto-pilot failed: {apError}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onGenerate}
          disabled={loading || !canGenerate || autoPilot}
          className="px-6 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating... {elapsed > 0 && <span className="text-white/70 text-sm">{elapsed}s</span>}
            </>
          ) : error ? (
            "Retry"
          ) : (
            "Generate Screenplay"
          )}
        </button>

        {/* Auto-Pilot button */}
        {onAutoPilotDone && !autoPilot && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {/* Provider selector for auto-pilot */}
              <div className="flex bg-surface border border-border rounded-lg overflow-hidden">
                <button type="button" onClick={() => setProvider("gemini")} className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${provider === "gemini" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-primary"}`}>Gemini</button>
                <button type="button" onClick={() => setProvider("qwen")} className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${provider === "qwen" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-primary"}`}>Qwen</button>
                <button type="button" onClick={() => setProvider("openai")} className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${provider === "openai" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-primary"}`}>GPT Image</button>
                <button type="button" onClick={() => setProvider("leonardo")} className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${provider === "leonardo" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-primary"}`}>Leonardo</button>
              </div>
              <button
                onClick={handleAutoPilot}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-4 py-3 border border-accent/40 hover:bg-accent/10 text-accent rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                title="Auto-Pilot: Generate screenplay, images, and publish in one click"
              >
                <Sparkles className="w-4 h-4" />
                Auto-Pilot
              </button>
            </div>
            {/* Visual style indicator */}
            {series?.visualStyle && (() => {
              const vs = getVisualStyle(series.visualStyle)
              return (
                <div className="flex items-center gap-1.5 text-xs text-text-muted pl-0.5">
                  <span>{vs.emoji}</span>
                  <span>Visual style: <span className="text-text-primary">{vs.name}</span></span>
                </div>
              )
            })()}
          </div>
        )}

        {!loading && error && (
          <p className="text-xs text-text-muted">Tip: Modify the direction above and try again.</p>
        )}
      </div>

      {/* Reset Step link */}
      {onResetStep && (
        <div className="mt-8 pt-4 border-t border-card-border">
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
