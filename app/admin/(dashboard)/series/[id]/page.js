"use client"

import { useState, useEffect, use, useRef } from "react"
import Link from "next/link"
import { loadSeries, loadEpisodes, loadCharacters, deleteEpisode, exportSeriesBackup, loadImage, updateSeries } from "@/lib/storage-api"
import { getThemeById } from "@/config/themes"
import CharacterCard from "@/components/characters/CharacterCard"
import EpisodeCard from "@/components/series/EpisodeCard"
import Breadcrumb from "@/components/ui/Breadcrumb"
import { Pin, Check, Trash2, AlertTriangle, ChevronDown, Activity, Eye, EyeOff } from "lucide-react"
import ConfirmDialog from "@/components/ui/ConfirmDialog"
import { episodeCardCtaLabel, episodeIsPopulated, isUsableEpisodeStill, seriesPrimaryAction, watchPlayQuery, watchVersionLabel, watchVersionOptions } from "@/lib/episode-watch"

// ─── Story Health Panel ────────────────────────────────────────────────────────

function ageBadgeClass(age) {
  if (age <= 2) return "bg-green-500/15 text-green-400"
  if (age <= 4) return "bg-amber-500/15 text-amber-400"
  return "bg-accent/15 text-accent"
}

function isSimilar(a, b) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
  const na = normalize(a), nb = normalize(b)
  const shorter = na.length < nb.length ? na : nb
  const longer  = na.length >= nb.length ? na : nb
  const matches = shorter.split(" ").filter((w) => longer.includes(w))
  return matches.length / shorter.split(" ").length > 0.6
}

function StoryHealthPanel({ series, episodes, characters, seriesId, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState(Array.isArray(series.ongoingPlotThreads) ? series.ongoingPlotThreads : [])
  const [pinned, setPinned]   = useState(Array.isArray(series.pinnedThreads) ? series.pinnedThreads : [])
  const [working, setWorking] = useState(null)

  const completedCount = episodes.filter((e) => e.status === "completed").length

  async function mutate(action, threadIndex) {
    setWorking(threadIndex)
    try {
      const res = await fetch(`/api/admin/series/${seriesId}/threads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, threadIndex }),
      })
      const data = await res.json()
      if (res.ok) {
        setThreads(Array.isArray(data.ongoingPlotThreads) ? data.ongoingPlotThreads : [])
        setPinned(Array.isArray(data.pinnedThreads) ? data.pinnedThreads : [])
        onUpdate?.({ ongoingPlotThreads: data.ongoingPlotThreads, pinnedThreads: data.pinnedThreads })
      }
    } finally {
      setWorking(null)
    }
  }

  // Detect stale threads — introduced X episodes ago but never mentioned since
  // We approximate "age" by position in list (earlier = older in most cases)
  // and flag any thread that appears verbatim in no episode screenplay summary
  function threadAge(thread) {
    // Scan episode summaries for any mention
    for (let i = episodes.length - 1; i >= 0; i--) {
      const ep = episodes[i]
      const mentioned = [
        ...(Array.isArray(ep.plotThreadsIntroduced) ? ep.plotThreadsIntroduced : []),
        ...(Array.isArray(ep.plotThreadsResolved)   ? ep.plotThreadsResolved   : []),
      ]
      if (mentioned.some((t) => t === thread || isSimilar(t, thread))) {
        return completedCount - ep.episodeNumber
      }
    }
    return completedCount
  }

  // Duplicate detection
  function hasDuplicate(thread, index) {
    return threads.some((t, i) => i !== index && isSimilar(t, thread))
  }

  // Character arc summary
  function characterArcState(char) {
    const arc = char.personality?.arcProgression
    if (!Array.isArray(arc) || arc.length === 0) return null
    return arc[arc.length - 1]
  }

  const bibleScore = Math.min(100, Math.round(
    (((series.seriesBible?.locations?.length || 0) > 0 ? 34 : 0) +
     ((series.seriesBible?.keyEvents?.length  || 0) > 0 ? 33 : 0) +
     ((series.seriesBible?.worldRules?.length || 0) > 0 ? 33 : 0))
  ))

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-text-muted hover:text-text-primary transition-colors mb-2 w-full"
      >
        <Activity className="w-3.5 h-3.5 text-accent" />
        <span className="font-semibold text-text-primary">STORY HEALTH</span>
        <span className="ml-auto flex items-center gap-2">
          {threads.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-2 text-text-muted">{threads.length} threads</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="p-4 bg-surface border border-border rounded-xl space-y-5">

          {/* Plot Thread Health */}
          <div>
            <div className="text-xs font-semibold text-text-muted mb-2 flex items-center justify-between">
              <span>PLOT THREADS</span>
              <span className="font-normal">{threads.length} open</span>
            </div>

            {threads.length === 0 ? (
              <p className="text-xs text-text-muted">No open plot threads — they appear after episodes are published.</p>
            ) : (
              <div className="space-y-2">
                {/* Pinned first */}
                {[...threads]
                  .map((t, i) => ({ t, i, isPinned: pinned.includes(t) }))
                  .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
                  .map(({ t, i, isPinned }) => {
                    const age    = threadAge(t)
                    const stale  = age >= 5
                    const dupWarn = hasDuplicate(t, i)
                    const busy   = working === i

                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border text-sm ${
                          isPinned ? "border-accent/30 bg-accent/5" : "border-card-border bg-surface-2"
                        }`}
                      >
                        {/* Thread text + badges */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            {isPinned && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-semibold">PRIORITY</span>
                            )}
                            {stale && (
                              <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                                <AlertTriangle className="w-2.5 h-2.5" /> Stale
                              </span>
                            )}
                            {dupWarn && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">⚠ Possible duplicate</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${ageBadgeClass(age)}`}>
                              {age === 0 ? "just introduced" : `${age} ep${age !== 1 ? "s" : ""} ago`}
                            </span>
                          </div>
                          <p className="text-text-primary text-xs leading-snug">{t}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => mutate(isPinned ? "unpin" : "pin", i)}
                            disabled={!!busy}
                            title={isPinned ? "Unpin" : "Pin as priority"}
                            className={`p-1 rounded transition-colors ${isPinned ? "text-accent" : "text-text-muted hover:text-accent"}`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => mutate("resolve", i)}
                            disabled={!!busy}
                            title="Mark resolved"
                            className="p-1 rounded text-text-muted hover:text-green-400 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => mutate("delete", i)}
                            disabled={!!busy}
                            title="Delete"
                            className="p-1 rounded text-text-muted hover:text-accent transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Character Arc Summary */}
          {characters.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-text-muted mb-2">CHARACTER ARCS</div>
              <div className="space-y-2">
                {characters.map((char) => {
                  const arc = characterArcState(char)
                  const allArcs = char.personality?.arcProgression || []
                  const lastEp  = allArcs[allArcs.length - 1]?.episode
                  const stagnant = lastEp !== undefined && completedCount - lastEp >= 3
                  return (
                    <div key={char.id} className="flex items-start gap-2.5 p-2.5 bg-surface-2 rounded-lg border border-card-border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-text-primary">{char.name}</span>
                          <span className="text-[10px] text-text-muted">({char.role})</span>
                          {stagnant && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Stagnant</span>
                          )}
                        </div>
                        {arc ? (
                          <p className="text-[11px] text-text-muted leading-snug">
                            Ep. {lastEp}: {arc.state}
                          </p>
                        ) : (
                          <p className="text-[11px] text-text-muted">No arc updates yet</p>
                        )}
                      </div>
                      <Link
                        href={`/admin/series/${seriesId}/characters`}
                        className="shrink-0 text-[10px] text-text-muted hover:text-accent transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Series Bible Completeness */}
          <div>
            <div className="text-xs font-semibold text-text-muted mb-2 flex items-center justify-between">
              <span>SERIES BIBLE COMPLETENESS</span>
              <span>{bibleScore}%</span>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${bibleScore >= 80 ? "bg-green-500" : bibleScore >= 40 ? "bg-amber-500" : "bg-accent"}`}
                style={{ width: `${bibleScore}%` }}
              />
            </div>
            <div className="flex gap-3 mt-1.5 text-[10px] text-text-muted">
              <span className={(series.seriesBible?.locations?.length || 0) > 0 ? "text-green-400" : ""}>
                {series.seriesBible?.locations?.length || 0} locations
              </span>
              <span className={(series.seriesBible?.keyEvents?.length || 0) > 0 ? "text-green-400" : ""}>
                {series.seriesBible?.keyEvents?.length || 0} key events
              </span>
              <span className={(series.seriesBible?.worldRules?.length || 0) > 0 ? "text-green-400" : ""}>
                {series.seriesBible?.worldRules?.length || 0} world rules
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SeriesDetailPage({ params }) {
  const { id } = use(params)
  const seriesId = Number(id)
  const [series, setSeries] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [characters, setCharacters] = useState([])
  const [thumbnails, setThumbnails] = useState({})
  const [bibleOpen, setBibleOpen] = useState(false)
  const [worldRules, setWorldRules] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [togglingEp, setTogglingEp] = useState(null)      // episodeId being toggled
  const [togglingArc, setTogglingArc] = useState(null)    // arc index being toggled
  const [deleteTarget, setDeleteTarget] = useState(null)  // episode to confirm-delete
  const [loading, setLoading] = useState(true)
  const [renders, setRenders] = useState({})
  const [watchVersion, setWatchVersion] = useState(null)
  const watchPlayerRef = useRef(null)

  useEffect(() => {
    loadData()
  }, [seriesId])

  async function loadData() {
    const [s, eps, chars] = await Promise.all([
      loadSeries(seriesId),
      loadEpisodes(seriesId),
      loadCharacters(seriesId),
    ])
    setSeries(s)
    setEpisodes(eps)
    setCharacters(chars)
    setWorldRules(s?.seriesBible?.worldRules?.join("\n") || "")

    const probes = {}
    await Promise.all(
      (eps || []).map(async (ep) => {
        if (!episodeIsPopulated(ep)) return
        try {
          const res = await fetch(`/api/admin/episodes/${ep.id}/video`)
          if (!res.ok) return
          const data = await res.json()
          if (data?.url) probes[ep.id] = data
        } catch {
          // no remote MP4 yet
        }
      })
    )
    setRenders(probes)

    // Load thumbnails for completed or populated episodes
    const thumbs = {}
    for (const ep of eps) {
      if (ep.status === "completed" || episodeIsPopulated(ep)) {
        const img = await loadImage(ep.id, 0)
        if (isUsableEpisodeStill(img?.url)) {
          thumbs[ep.id] = img.url
        }
      }
    }
    setThumbnails(thumbs)
    setLoading(false)
  }

  async function handleDeleteEpisode(epId) {
    await deleteEpisode(epId)
    setEpisodes((prev) => prev.filter((e) => e.id !== epId))
  }

  async function handleToggleEpisodePublish(ep) {
    setTogglingEp(ep.id)
    try {
      const res = await fetch(`/api/admin/episodes/${ep.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !ep.published }),
      })
      if (res.ok) {
        setEpisodes((prev) =>
          prev.map((e) => e.id === ep.id ? { ...e, published: !ep.published } : e)
        )
      }
    } finally {
      setTogglingEp(null)
    }
  }

  async function handleToggleArcPublish(arcEpisodes, publish) {
    const arcIndex = Math.floor((arcEpisodes[0].episodeNumber - 1) / ARC_SIZE)
    setTogglingArc(arcIndex)
    try {
      const ids = arcEpisodes.filter((e) => e.status === "completed").map((e) => e.id)
      if (ids.length === 0) return
      const res = await fetch("/api/admin/episodes/batch-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeIds: ids, published: publish }),
      })
      if (res.ok) {
        const idSet = new Set(ids)
        setEpisodes((prev) =>
          prev.map((e) => idSet.has(e.id) ? { ...e, published: publish } : e)
        )
      }
    } finally {
      setTogglingArc(null)
    }
  }

  async function handleTogglePublish() {
    setPublishing(true)
    try {
      const updated = await updateSeries(seriesId, { published: !series.published })
      setSeries(updated)
    } catch (err) {
      console.error("Failed to toggle publish:", err)
    } finally {
      setPublishing(false)
    }
  }

  async function handleBackup() {
    const backup = await exportSeriesBackup(seriesId)
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `kineva-${series.title.replace(/\s+/g, "-").toLowerCase()}-backup.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-surface rounded animate-pulse mb-4" />
        <div className="h-4 w-96 bg-surface rounded animate-pulse" />
      </div>
    )
  }

  if (!series) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-text-muted">Series not found.</p>
        <Link href="/admin" className="text-accent mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  const theme = getThemeById(series.theme)
  const nextEpisodeNumber = episodes.length + 1
  const primary = seriesPrimaryAction(episodes, renders)
  const watchEpisode = primary.type === "watch" ? primary.episode : null

  function handleWatchClick(event) {
    if (primary.type !== "watch") return
    event.preventDefault()
    document.getElementById("episode-watch")?.scrollIntoView({ behavior: "smooth", block: "start" })
    const player = watchPlayerRef.current
    if (player) {
      player.play?.().catch(() => {})
    }
  }

  // Arc grouping — 15 episodes per arc (adjust if needed)
  const ARC_SIZE = 15
  const arcs = episodes.length > 0
    ? Array.from(
        { length: Math.ceil(Math.max(...episodes.map((e) => e.episodeNumber)) / ARC_SIZE) },
        (_, i) => ({
          index: i,
          label: `Arc ${i + 1}`,
          episodes: episodes.filter(
            (e) => e.episodeNumber > i * ARC_SIZE && e.episodeNumber <= (i + 1) * ARC_SIZE
          ).sort((a, b) => a.episodeNumber - b.episodeNumber),
        })
      ).filter((arc) => arc.episodes.length > 0)
    : []
  const useArcs = arcs.length > 1

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Breadcrumb items={[
          { label: "Dashboard", href: "/admin" },
          { label: series.title },
        ]} />
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">{theme?.icon}</span>
              <h1 className="text-3xl font-serif font-bold">{series.title}</h1>
              {series.published ? (
                <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
                  Published
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
                  Draft
                </span>
              )}
            </div>
            <p className="text-text-muted">{series.premise}</p>
            <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
              <span>{theme?.name}</span>
              <span>&middot;</span>
              <span>{series.tone}</span>
              <span>&middot;</span>
              <span>{series.setting}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleTogglePublish}
              disabled={publishing}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                series.published
                  ? "border border-border text-text-muted hover:text-text-primary hover:border-text-muted"
                  : "bg-green-600 hover:bg-green-700 text-white"
              } disabled:opacity-50`}
            >
              {publishing ? "..." : series.published ? "Unpublish" : "Publish"}
            </button>
            <button
              onClick={handleBackup}
              className="px-4 py-2 text-sm border border-border rounded-lg text-text-muted hover:text-text-primary hover:border-text-muted transition-colors"
            >
              Download Backup
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Episodes Column */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Episodes</h2>
            {primary.type === "watch" ? (
              <a
                href="#episode-watch"
                onClick={handleWatchClick}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
              >
                {episodeCardCtaLabel("watch")} {primary.episode.episodeNumber}
              </a>
            ) : primary.type === "view" ? (
              <Link
                href={`/admin/series/${seriesId}/episode/${primary.episode.episodeNumber}`}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
              >
                {episodeCardCtaLabel("view")} {primary.episode.episodeNumber}
              </Link>
            ) : primary.type === "continue" ? (
              <Link
                href={`/admin/series/${seriesId}/episode/${primary.episode.episodeNumber}`}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
              >
                {episodeCardCtaLabel("continue")} {primary.episode.episodeNumber}
              </Link>
            ) : (
              <Link
                href={`/admin/series/${seriesId}/episode/new`}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
              >
                + Episode {nextEpisodeNumber}
              </Link>
            )}
          </div>

          {watchEpisode && renders[watchEpisode.id]?.url ? (
            <div id="episode-watch" className="mb-6 p-4 bg-surface border border-border rounded-xl max-w-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">
                  {watchEpisode.title || `Episode ${watchEpisode.episodeNumber}`}
                </h2>
                <Link
                  href={`/admin/series/${seriesId}/episode/${watchEpisode.episodeNumber}`}
                  className="text-xs text-accent hover:underline"
                >
                  Open episode
                </Link>
              </div>
              {(() => {
                const render = renders[watchEpisode.id]
                const options = watchVersionOptions(render)
                const active = watchVersion || render?.version || "legacy"
                return (
                  <>
                    {options.length > 1 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {options.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setWatchVersion(opt.id)}
                            className={`text-xs px-2 py-1 rounded ${active === opt.id ? "bg-accent text-white" : "bg-surface-2 text-text-muted"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-text-muted mb-2">
                        {watchVersionLabel(active)}
                      </div>
                    )}
                    <video
                      ref={watchPlayerRef}
                      key={`${watchEpisode.id}-${active}`}
                      src={`/api/admin/episodes/${watchEpisode.id}/video?play=1${watchPlayQuery(active)}`}
                      controls
                      playsInline
                      className="w-full bg-black rounded-lg"
                      style={{ aspectRatio: "9 / 16" }}
                    />
                  </>
                )
              })()}
            </div>
          ) : null}

          {series.lastCliffhanger && (
            <div className="mb-4 p-4 bg-surface-2 border border-border rounded-xl">
              <div className="text-xs text-accent font-medium mb-1">LAST CLIFFHANGER</div>
              <p className="text-sm text-text-primary">{series.lastCliffhanger}</p>
            </div>
          )}

          {/* Story Health Panel */}
          <StoryHealthPanel
            series={series}
            episodes={episodes}
            characters={characters}
            seriesId={seriesId}
            onUpdate={(updates) => setSeries((prev) => ({ ...prev, ...updates }))}
          />

          {/* Series Bible */}
          {series.seriesBible && (
            <div className="mb-4">
              <button
                onClick={() => setBibleOpen(!bibleOpen)}
                className="flex items-center gap-2 text-xs font-medium text-text-muted hover:text-text-primary transition-colors mb-2"
              >
                <span className={`transition-transform ${bibleOpen ? "rotate-90" : ""}`}>&rsaquo;</span>
                SERIES BIBLE
              </button>
              {bibleOpen && (
                <div className="p-4 bg-surface border border-border rounded-xl space-y-4">
                  {series.seriesBible.locations?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-text-muted mb-1">Locations</div>
                      <div className="space-y-1">
                        {series.seriesBible.locations.map((loc, i) => (
                          <div key={i} className="text-sm">
                            <span className="text-text-primary">{loc.name}</span>
                            {loc.description && <span className="text-text-muted"> — {loc.description}</span>}
                            {loc.firstMentioned && <span className="text-xs text-text-muted ml-1">(Ep. {loc.firstMentioned})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {series.seriesBible.keyEvents?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-text-muted mb-1">Key Events</div>
                      <div className="space-y-1">
                        {series.seriesBible.keyEvents.map((evt, i) => (
                          <div key={i} className="text-sm flex items-start gap-2">
                            <span className="text-xs text-accent font-bold flex-shrink-0">Ep. {evt.episodeNumber}</span>
                            <span className="text-text-muted">{evt.event}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-text-muted mb-1">World Rules</div>
                    <textarea
                      value={worldRules}
                      onChange={(e) => setWorldRules(e.target.value)}
                      onBlur={async () => {
                        const rules = worldRules.split("\n").filter(Boolean)
                        await updateSeries(seriesId, {
                          seriesBible: { ...series.seriesBible, worldRules: rules },
                        })
                      }}
                      rows={3}
                      placeholder="Add world-building notes, one per line..."
                      className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {episodes.length === 0 ? (
            <div className="text-center py-12 bg-surface rounded-xl border border-border">
              <p className="text-text-muted mb-2">No episodes yet.</p>
              <p className="text-sm text-text-muted">Add characters first, then create your first episode.</p>
            </div>
          ) : useArcs ? (
            /* ── Arc-grouped view ─────────────────────────────────── */
            <div className="space-y-6">
              {arcs.map((arc) => {
                const completedInArc = arc.episodes.filter((e) => e.status === "completed")
                const allPublished   = completedInArc.length > 0 && completedInArc.every((e) => e.published)
                const anyPublished   = completedInArc.some((e) => e.published)
                const isTogglingArc  = togglingArc === arc.index

                return (
                  <div key={arc.index}>
                    {/* Arc header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
                          {arc.label}
                        </span>
                        <span className="text-xs text-text-muted">
                          Ep {arc.episodes[0].episodeNumber}–{arc.episodes[arc.episodes.length - 1].episodeNumber}
                        </span>
                        {completedInArc.length > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            allPublished
                              ? "bg-green-500/15 text-green-400"
                              : anyPublished
                              ? "bg-yellow-500/15 text-yellow-400"
                              : "bg-surface-2 text-text-muted"
                          }`}>
                            {allPublished ? "Published" : anyPublished ? "Partial" : "Draft"}
                          </span>
                        )}
                      </div>
                      {completedInArc.length > 0 && (
                        <button
                          disabled={isTogglingArc}
                          onClick={() => handleToggleArcPublish(arc.episodes, !allPublished)}
                          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            allPublished
                              ? "border border-border text-text-muted hover:text-text-primary"
                              : "bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30"
                          }`}
                        >
                          {isTogglingArc ? "..." : allPublished
                            ? <><EyeOff className="w-3 h-3" /> Unpublish Arc</>
                            : <><Eye className="w-3 h-3" /> Publish Arc</>
                          }
                        </button>
                      )}
                    </div>

                    {/* Episode cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {arc.episodes.map((ep) => (
                        <EpisodeCard
                          key={ep.id}
                          ep={ep}
                          seriesId={seriesId}
                          thumbnail={thumbnails[ep.id]}
                          hasRender={Boolean(renders[ep.id])}
                          toggling={togglingEp === ep.id}
                          onTogglePublish={() => handleToggleEpisodePublish(ep)}
                          onDelete={() => setDeleteTarget(ep)}
                          onWatchClick={handleWatchClick}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Flat list (few episodes, no arc grouping) ────────── */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {episodes.map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  ep={ep}
                  seriesId={seriesId}
                  thumbnail={thumbnails[ep.id]}
                  hasRender={Boolean(renders[ep.id])}
                  toggling={togglingEp === ep.id}
                  onTogglePublish={() => handleToggleEpisodePublish(ep)}
                  onDelete={() => setDeleteTarget(ep)}
                  onWatchClick={handleWatchClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* Characters Sidebar */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Characters</h2>
            <Link
              href={`/admin/series/${seriesId}/characters`}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Manage
            </Link>
          </div>

          {characters.length === 0 ? (
            <div className="text-center py-8 bg-surface rounded-xl border border-border">
              <p className="text-text-muted mb-3 text-sm">No characters yet.</p>
              <Link
                href={`/admin/series/${seriesId}/characters`}
                className="text-sm text-accent hover:text-accent-hover"
              >
                + Add Characters
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {characters.map((char) => (
                <CharacterCard key={char.id} character={char} compact />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Episode delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Episode?"
        message={
          deleteTarget
            ? `Episode ${deleteTarget.episodeNumber}${deleteTarget.title ? ` — "${deleteTarget.title}"` : ""} and all its images will be permanently deleted. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete Episode"
        onConfirm={() => {
          const ep = deleteTarget
          setDeleteTarget(null)
          handleDeleteEpisode(ep.id)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
