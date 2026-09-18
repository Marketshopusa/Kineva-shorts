"use client"

import { useState, useEffect, use, useMemo, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  loadSeries, loadEpisodeByNumber, loadImages, loadCharacters,
  updateEpisode, updateSeries, saveImage,
} from "@/lib/storage-api"
import { useExport } from "@/hooks/useExport"
import { useVisuals } from "@/hooks/useVisuals"
import { calculateTotalFrames, ensureReadableDurations, generateSubtitlesForScene } from "@/lib/subtitleUtils"
import { getLanguageByCode, LANGUAGES } from "@/config/languages"
import { normalizeDubScenes, recalcDefaultDubLang, selectDubForLang } from "@/lib/dubUtils"
import { getTrackById, AUDIO_TRACKS } from "@/config/audioTracks"
import Breadcrumb from "@/components/ui/Breadcrumb"
import SubtitleEditor from "@/components/ui/SubtitleEditor"
import SharePanel from "@/components/ui/SharePanel"

const TYPE_COLORS = {
  HOOK: "bg-red-500/20 text-red-400",
  SETUP: "bg-blue-500/20 text-blue-400",
  CLUE: "bg-yellow-500/20 text-yellow-400",
  BREAKING_POINT: "bg-purple-500/20 text-purple-400",
  CONFRONTATION: "bg-orange-500/20 text-orange-400",
  CLIFFHANGER: "bg-pink-500/20 text-pink-400",
}

export default function EpisodeDetailPage({ params }) {
  const { id, num } = use(params)
  const seriesId = Number(id)
  const episodeNumber = Number(num)
  const router = useRouter()

  const [series, setSeries] = useState(null)
  const [episode, setEpisode] = useState(null)
  const [characters, setCharacters] = useState([])
  const [imageUrls, setImageUrls] = useState({})
  const [pendingImages, setPendingImages] = useState({}) // sceneIndex -> { url, prompt } for unsaved base64 images
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("scenes")
  const [saving, setSaving] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateModal, setTranslateModal] = useState(false)
  const [translateSource, setTranslateSource] = useState("en")
  const [translateTargets, setTranslateTargets] = useState([])
  const [translateError, setTranslateError] = useState(null)
  const [musicTrack, setMusicTrack] = useState(null)
  const [musicVolume, setMusicVolume] = useState(1.0)
  const [previewingTrack, setPreviewingTrack] = useState(null)
  const [availableTracks, setAvailableTracks] = useState([])
  const [editedScenes, setEditedScenes] = useState(null)
  const [dubScenes, setDubScenes] = useState(null)
  const [defaultDubLang, setDefaultDubLang] = useState(null)
  const previewAudioRef = useRef(null)
  const [imageProvider, setImageProvider] = useState("gemini")
  const userPickedImageProvider = useRef(false)
  const [showWatermark, setShowWatermark] = useState(true)
  const [subtitleEnabled, setSubtitleEnabled] = useState(true)
  const [subtitleSize, setSubtitleSize] = useState(62)

  const exportHook = useExport()
  const visuals = useVisuals()

  useEffect(() => {
    loadData()
    fetchTracks()
    // Load default image provider from settings
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.defaultImageProvider && !userPickedImageProvider.current) {
          setImageProvider(data.defaultImageProvider)
        }
      })
      .catch(() => {})
  }, [seriesId, episodeNumber])

  async function fetchTracks() {
    try {
      const res = await fetch("/api/admin/audio-tracks")
      const data = await res.json()
      setAvailableTracks(data.tracks || AUDIO_TRACKS)
    } catch {
      setAvailableTracks(AUDIO_TRACKS)
    }
  }

  async function loadData() {
    const [s, ep, chars] = await Promise.all([
      loadSeries(seriesId),
      loadEpisodeByNumber(seriesId, episodeNumber),
      loadCharacters(seriesId),
    ])

    if (!ep) {
      router.push(`/admin/series/${seriesId}`)
      return
    }

    // Redirect in-progress episodes to the creation flow
    if (ep.status !== "completed") {
      router.push(`/admin/series/${seriesId}/episode/new`)
      return
    }

    setSeries(s)
    setEpisode(ep)
    setCharacters(chars)
    setEditedScenes(ep.screenplay?.scenes || [])
    setMusicTrack(ep.musicTrack || null)
    setMusicVolume(ep.musicVolume ?? 1.0)
    setDubScenes(ep.dubScenes || null)
    setDefaultDubLang(ep.defaultDubLang || null)

    // Load images — storage-api returns items with .url property
    const imgs = await loadImages(ep.id)
    const urlMap = {}
    for (const img of imgs) {
      if (img.url) urlMap[img.sceneIndex] = img.url
    }
    setImageUrls(urlMap)
    setLoading(false)
  }

  const scenes = editedScenes || episode?.screenplay?.scenes || []

  function handleSceneUpdate(index, updates) {
    setEditedScenes((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }

  async function handleOptimizeSubtitles() {
    if (!episode || !editedScenes) return
    setOptimizing(true)
    const languages = series?.languages || ["en"]
    const optimizedScenes = editedScenes.map((scene) => {
      let bestDuration = scene.duration_sec || 5
      for (const lang of languages) {
        const adjusted = ensureReadableDurations([scene], lang)[0]
        bestDuration = Math.max(bestDuration, adjusted.duration_sec || 5)
      }
      const adjustedScene = { ...scene, duration_sec: bestDuration }
      const subtitles = generateSubtitlesForScene(adjustedScene, languages)
      return { ...adjustedScene, subtitles }
    })
    setEditedScenes(optimizedScenes)
    await updateEpisode(episode.id, { screenplay: { scenes: optimizedScenes } })
    setOptimizing(false)
  }

  async function handleSave() {
    if (!episode || !editedScenes) return
    setSaving(true)
    try {
      await updateEpisode(episode.id, {
        screenplay: { scenes: editedScenes },
      })

      // Save all images still in base64 (regenerated but not yet uploaded to storage)
      const unsaved = Object.entries(imageUrls).filter(([, url]) => url?.startsWith("data:"))
      if (unsaved.length > 0) {
        await Promise.all(
          unsaved.map(([idx, url]) =>
            saveImage(episode.id, parseInt(idx), url, null).then((result) => {
              if (result?.url) {
                setImageUrls((prev) => ({ ...prev, [idx]: result.url }))
              }
              setPendingImages((prev) => {
                const next = { ...prev }
                delete next[idx]
                return next
              })
            })
          )
        )
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleMusicChange(trackId) {
    // Stop any preview when switching tracks
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }
    setPreviewingTrack(null)
    setMusicTrack(trackId)
    await updateEpisode(episode.id, { musicTrack: trackId || null })
  }

  async function handleVolumeChange(vol) {
    setMusicVolume(vol)
    await updateEpisode(episode.id, { musicVolume: vol })
  }

  function handlePreviewTrack(track) {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }
    if (previewingTrack === track.id) {
      setPreviewingTrack(null)
      return
    }
    const audio = new Audio(track.file)
    audio.volume = musicVolume * 0.3
    audio.play().catch(() => {})
    audio.onended = () => setPreviewingTrack(null)
    previewAudioRef.current = audio
    setPreviewingTrack(track.id)
  }

  async function handleTranslate() {
    if (!episode || translateTargets.length === 0) return
    setTranslating(true)
    setTranslateError(null)
    try {
      const res = await fetch("/api/admin/translate-episode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: episode.id,
          sourceLang: translateSource,
          targetLangs: translateTargets,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Translation failed")
      setEditedScenes(data.scenes)

      // Add any newly translated languages to the series if not already present
      const currentLangs = series?.languages || []
      const newLangs = translateTargets.filter((l) => !currentLangs.includes(l))
      if (newLangs.length > 0) {
        const updatedLangs = [...currentLangs, ...newLangs]
        await updateSeries(series.id, { languages: updatedLangs })
        setSeries((prev) => ({ ...prev, languages: updatedLangs }))
      }

      setTranslateModal(false)
    } catch (err) {
      setTranslateError(err.message)
    }
    setTranslating(false)
  }

  function openTranslateModal() {
    const langs = series?.languages || ["en"]
    setTranslateSource(langs[0] || "en")
    setTranslateTargets([])
    setTranslateError(null)
    setTranslateModal(true)
  }

  async function handleRegenerateImage(sceneIndex) {
    const scene = scenes[sceneIndex]
    if (!scene || !series) return
    const img = await visuals.generateImage(scene, sceneIndex, characters, series, imageProvider)

    if (img?.url) {
      // Show new image immediately in base64 while upload happens in background
      setImageUrls((prev) => ({ ...prev, [sceneIndex]: img.url }))
      // Track as pending so Save button picks it up if auto-save fails
      setPendingImages((prev) => ({ ...prev, [sceneIndex]: { url: img.url, prompt: img.prompt } }))

      // Auto-save: upload to versioned CDN path
      saveImage(episode.id, sceneIndex, img.url, img.prompt).then((result) => {
        // Switch from base64 to the permanent CDN URL (versioned — no cache issues)
        if (result?.url) {
          setImageUrls((prev) => ({ ...prev, [sceneIndex]: result.url }))
        }
        setPendingImages((prev) => {
          const next = { ...prev }
          delete next[sceneIndex]
          return next
        })
      }).catch((err) => {
        console.error("Image auto-save failed, will retry on Save:", err)
        // pendingImages already has it — Save button will retry
      })
    }
  }

  async function handleRegenerateAll() {
    for (let i = 0; i < scenes.length; i++) {
      await handleRegenerateImage(i)
    }
  }

  function handleExport(lang) {
    const l = getLanguageByCode(lang)
    // Build image data from API URLs
    const imgData = {}
    for (const [idx, url] of Object.entries(imageUrls)) {
      imgData[idx] = { url, approved: true }
    }
    const track = musicTrack ? (availableTracks.find((t) => t.id === musicTrack) || getTrackById(musicTrack)) : null
    exportHook.exportVideo({
      scenes,
      images: imgData,
      language: lang,
      isRtl: l?.direction === "rtl",
      musicUrl: track?.file || null,
      musicVolume,
      dubScenes,
      defaultDubLang,
      watermark: showWatermark,
      subtitleEnabled,
      subtitleSize,
    })
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-6 w-64 bg-surface rounded animate-pulse mb-4" />
        <div className="h-8 w-48 bg-surface rounded animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-surface rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!episode || !series) return null

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_sec || 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: series.title, href: `/admin/series/${seriesId}` },
        { label: `Episode ${episodeNumber}` },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold">
            {episode.title || `Episode ${episodeNumber}`}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
            <span>{scenes.length} scenes</span>
            <span>&middot;</span>
            <span>{totalDuration}s</span>
            <span>&middot;</span>
            <span className="text-green-400">Completed</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openTranslateModal}
            disabled={translating || saving || optimizing}
            className="px-4 py-2 bg-surface-2 hover:bg-surface border border-border disabled:opacity-50 text-text-primary rounded-lg text-sm font-medium transition-colors"
            title="Translate scene narrations to other languages using AI"
          >
            Auto Translate
          </button>
          <button
            onClick={handleOptimizeSubtitles}
            disabled={optimizing || saving}
            className="px-4 py-2 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 text-accent rounded-lg text-sm font-medium transition-colors"
            title="Re-generate optimized subtitle timing for all scenes and languages"
          >
            {optimizing ? "Optimizing..." : "Optimize Subtitles"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || optimizing}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? "Saving..." : Object.keys(pendingImages).length > 0 ? `Save Changes (${Object.keys(pendingImages).length} image${Object.keys(pendingImages).length > 1 ? "s" : ""} pending)` : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Background Music */}
      <div className="mb-5 p-4 bg-surface border border-border rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Background Music</span>
          {musicTrack && (
            <button
              onClick={() => handleMusicChange(null)}
              className="text-xs text-text-muted hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          )}
        </div>

        {/* Track grid */}
        <div className="flex flex-wrap gap-2 mb-3">
          {availableTracks.map((track) => {
            const selected = musicTrack === track.id
            const unavailable = track.available === false
            const isPreviewing = previewingTrack === track.id
            return (
              <div
                key={track.id}
                className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors ${
                  selected
                    ? "border-accent bg-accent/10 text-text-primary"
                    : unavailable
                    ? "border-border bg-surface-2 text-text-muted opacity-40 cursor-not-allowed"
                    : "border-border bg-surface-2 text-text-primary hover:border-accent/50"
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={() => !unavailable && handleMusicChange(track.id)}
                    disabled={unavailable}
                    className="flex-1 text-left min-w-0"
                  >
                    <span className="text-xs font-medium block truncate">{track.name}</span>
                    <span className="text-[10px] text-text-muted mt-0.5 block">{track.genre ? `${track.genre} · ` : ""}{track.mood}</span>
                  </button>
                  {!unavailable && (
                    <button
                      onClick={() => handlePreviewTrack(track)}
                      className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-full transition-colors ${
                        isPreviewing
                          ? "bg-accent text-white"
                          : "text-text-muted hover:text-accent"
                      }`}
                      title={isPreviewing ? "Stop preview" : "Preview track"}
                    >
                      {isPreviewing ? (
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                      )}
                    </button>
                  )}
                </div>
                {track.tags?.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {track.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-input-bg rounded text-text-muted">{tag}</span>
                    ))}
                    {track.bpm && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-input-bg rounded text-text-muted">{track.bpm} BPM</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Volume slider — shown when a track is selected */}
        {musicTrack && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-3">
              <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={musicVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="text-[10px] text-text-muted w-8 text-right shrink-0">
                {Math.round(musicVolume * 100)}%
              </span>
            </div>
            <p className="text-[10px] text-text-muted mt-1">Music volume in exported video</p>
          </div>
        )}
      </div>

      {/* Translate Modal */}
      {translateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !translating && setTranslateModal(false)}>
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-4">Auto Translate</h2>

            {/* Source language */}
            <div className="mb-4">
              <label className="text-xs text-text-muted font-medium block mb-1.5">Translate from</label>
              <div className="flex flex-wrap gap-1.5">
                {(series?.languages || ["en"]).map((l) => {
                  const lang = getLanguageByCode(l)
                  return (
                    <button
                      key={l}
                      onClick={() => setTranslateSource(l)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        translateSource === l
                          ? "bg-accent/20 border-accent/40 text-accent"
                          : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {lang?.flag} {l.toUpperCase()}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Target languages — all supported, not just series ones */}
            <div className="mb-5">
              <label className="text-xs text-text-muted font-medium block mb-1.5">Translate into</label>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.filter((l) => l.code !== translateSource).map(({ code, flag, name }) => {
                  const checked = translateTargets.includes(code)
                  const isNew = !(series?.languages || []).includes(code)
                  return (
                    <button
                      key={code}
                      onClick={() =>
                        setTranslateTargets((prev) =>
                          checked ? prev.filter((x) => x !== code) : [...prev, code]
                        )
                      }
                      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        checked
                          ? "bg-accent/20 border-accent/40 text-accent"
                          : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {flag} {code.toUpperCase()}
                      {isNew && (
                        <span className="text-[9px] font-semibold bg-green-500/20 text-green-400 px-1 rounded">
                          new
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {translateTargets.some((l) => !(series?.languages || []).includes(l)) && (
                <p className="text-[11px] text-green-400 mt-2">
                  New languages will be added to this series automatically.
                </p>
              )}
            </div>

            {translateError && (
              <p className="text-xs text-red-400 mb-3">{translateError}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setTranslateModal(false)}
                disabled={translating}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTranslate}
                disabled={translating || translateTargets.length === 0}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {translating ? "Translating..." : `Translate to ${translateTargets.length} language${translateTargets.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {["scenes", "summary", "export"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "text-accent border-accent"
                : "text-text-muted border-transparent hover:text-text-primary"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Scenes Tab */}
      {activeTab === "scenes" && (
        <ScenesTab
          scenes={scenes}
          imageUrls={imageUrls}
          languages={series.languages || ["en"]}
          onUpdate={handleSceneUpdate}
          onRegenerate={handleRegenerateImage}
          onRegenerateAll={handleRegenerateAll}
          regeneratingStatuses={visuals.statuses}
          imageProvider={imageProvider}
          onImageProviderChange={(p) => { userPickedImageProvider.current = true; setImageProvider(p) }}
        />
      )}

      {/* Summary Tab */}
      {activeTab === "summary" && (
        <SummaryTab episode={episode} />
      )}

      {/* Export Tab */}
      {activeTab === "export" && (
        <ExportTab
          series={series}
          episode={episode}
          scenes={scenes}
          imageUrls={imageUrls}
          exportHook={exportHook}
          onExport={handleExport}
          episodeNumber={episodeNumber}
          dubScenes={dubScenes}
          onDubScenesChange={setDubScenes}
          defaultDubLang={defaultDubLang}
          onDefaultDubLangChange={setDefaultDubLang}
          showWatermark={showWatermark}
          onWatermarkChange={setShowWatermark}
          subtitleEnabled={subtitleEnabled}
          onSubtitleEnabledChange={setSubtitleEnabled}
          subtitleSize={subtitleSize}
          onSubtitleSizeChange={setSubtitleSize}
        />
      )}
    </div>
  )
}

function ScenesTab({ scenes, imageUrls, languages, onUpdate, onRegenerate, onRegenerateAll, regeneratingStatuses, imageProvider, onImageProviderChange }) {
  const [activeLangs, setActiveLangs] = useState({})

  function getLang(i) {
    return activeLangs[i] || languages[0] || "en"
  }

  const IMAGE_PROVIDERS = [
    { id: "gemini", label: "Gemini" },
    { id: "qwen", label: "Qwen" },
    { id: "openai", label: "GPT Image" },
    { id: "leonardo", label: "Leonardo" },
    { id: "leonardo-nano", label: "Leo Nano" },
    { id: "leonardo-gpt2", label: "Leo GPT2" },
    { id: "phoenix", label: "Phoenix ✦" },
  ]

  return (
    <div className="space-y-6">
      {/* Image provider selector for regeneration */}
      <div className="flex items-center gap-3 p-3 bg-surface border border-border rounded-xl">
        <span className="text-xs text-text-muted shrink-0">Regenerate with:</span>
        <div className="flex bg-surface-2 border border-border rounded-lg overflow-hidden">
          {IMAGE_PROVIDERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onImageProviderChange(id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                imageProvider === id ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={onRegenerateAll}
          disabled={Object.values(regeneratingStatuses).some(s => s === "generating")}
          className="ml-auto px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 shrink-0"
        >
          Regenerate All
        </button>
      </div>

      {scenes.map((scene, i) => {
        const lang = getLang(i)
        const textKey = `text_${lang}`
        const typeColor = TYPE_COLORS[scene.type] || "bg-surface-2 text-text-muted"
        const isRegenerating = regeneratingStatuses[i] === "generating"
        const isError = regeneratingStatuses[i] === "error"

        return (
          <div key={i} className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex flex-col md:flex-row">
              {/* Image */}
              <div className="md:w-48 lg:w-56 flex-shrink-0 relative bg-black">
                {imageUrls[i] ? (
                  <img
                    src={imageUrls[i]}
                    alt={`Scene ${i + 1}`}
                    className="w-full h-full object-cover aspect-[9/16] md:aspect-auto md:h-full"
                  />
                ) : (
                  <div className="w-full aspect-[9/16] md:aspect-auto md:h-full bg-surface-2 flex items-center justify-center">
                    <span className="text-text-muted text-xs">No image</span>
                  </div>
                )}
                {isRegenerating && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-xs font-medium animate-pulse">Generating...</span>
                  </div>
                )}
                <button
                  onClick={() => onRegenerate(i)}
                  disabled={isRegenerating}
                  className={`absolute bottom-2 right-2 px-2 py-1 text-white text-xs rounded-lg transition-colors disabled:opacity-50 ${isError ? "bg-red-600/90 hover:bg-red-700" : "bg-black/70 hover:bg-black/90"}`}
                >
                  {isRegenerating ? "..." : isError ? "Failed — Retry" : "Regenerate"}
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text-muted">#{i + 1}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${typeColor}`}>
                      {scene.type?.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <input
                      type="number"
                      min={3}
                      max={15}
                      step={1}
                      value={scene.duration_sec || 5}
                      onChange={(e) => onUpdate(i, { duration_sec: Number(e.target.value) })}
                      className="w-12 px-1 py-0.5 bg-surface-2 border border-border rounded text-xs text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span>s</span>
                    <span>&middot;</span>
                    <span>{scene.tempo}</span>
                    <span>&middot;</span>
                    <span>zoom {scene.zoom_direction}</span>
                  </div>
                </div>

                {/* Language tabs */}
                <div className="flex gap-1 mb-2">
                  {languages.map((l) => (
                    <button
                      key={l}
                      onClick={() => setActiveLangs((prev) => ({ ...prev, [i]: l }))}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        lang === l
                          ? "bg-accent/20 text-accent"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Narration */}
                <textarea
                  value={scene[textKey] || ""}
                  onChange={(e) => onUpdate(i, { [textKey]: e.target.value })}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
                />

                {/* Visual description */}
                <div className="mt-2">
                  <label className="text-xs text-text-muted font-medium">Visual Description</label>
                  <textarea
                    value={scene.visual_description || ""}
                    onChange={(e) => onUpdate(i, { visual_description: e.target.value })}
                    rows={2}
                    className="w-full mt-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-xs text-text-muted focus:outline-none focus:border-accent resize-none"
                  />
                </div>

                {/* Characters */}
                {scene.characters?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {scene.characters.map((name) => (
                      <span key={name} className="text-xs bg-surface-2 px-2 py-0.5 rounded text-text-muted">
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Subtitle Editor */}
                <SubtitleEditor
                  scene={scene}
                  languages={languages}
                  onUpdate={(updates) => onUpdate(i, updates)}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SummaryTab({ episode }) {
  return (
    <div className="max-w-2xl space-y-6">
      {episode.summary && (
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-2">Summary</h3>
          <p className="text-sm text-text-muted leading-relaxed">{episode.summary}</p>
        </div>
      )}

      {episode.cliffhanger && (
        <div className="p-5 bg-surface-2 border border-accent/20 rounded-xl">
          <h3 className="text-sm font-semibold text-accent mb-2">Cliffhanger</h3>
          <p className="text-sm text-text-primary">{episode.cliffhanger}</p>
        </div>
      )}

      {episode.plotThreadsIntroduced?.length > 0 && (
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-2">Plot Threads Introduced</h3>
          <ul className="space-y-1">
            {episode.plotThreadsIntroduced.map((t, i) => (
              <li key={i} className="text-sm text-text-muted flex items-start gap-2">
                <span className="text-green-400 mt-0.5">+</span> {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {episode.plotThreadsResolved?.length > 0 && (
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-2">Plot Threads Resolved</h3>
          <ul className="space-y-1">
            {episode.plotThreadsResolved.map((t, i) => (
              <li key={i} className="text-sm text-text-muted flex items-start gap-2">
                <span className="text-accent mt-0.5">&check;</span> {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!episode.summary && !episode.cliffhanger && (
        <div className="text-center py-12 text-text-muted">
          No summary data available for this episode.
        </div>
      )}
    </div>
  )
}

const FPS = 30
const TRANSITION_FRAMES = 15

function ExportTab({ series, episode, scenes, imageUrls, exportHook, onExport, episodeNumber, dubScenes, onDubScenesChange, defaultDubLang, onDefaultDubLangChange, showWatermark, onWatermarkChange, subtitleEnabled, onSubtitleEnabledChange, subtitleSize, onSubtitleSizeChange }) {
  const { statuses, downloadUrls, progresses, errors, reset } = exportHook
  const languages = series?.languages || []
  const [previewLang, setPreviewLang] = useState(languages[0] || "en")
  const [remotion, setRemotion] = useState(null)
  // Track per-language dubbing state: { [lang]: 'idle'|'generating'|'error' }
  const [dubbingStates, setDubbingStates] = useState({})
  const [dubErrors, setDubErrors] = useState({})
  const [fixingSyncState, setFixingSyncState] = useState("idle") // idle | fixing | done | error
  const playerRef = useRef(null)

  // Load Remotion modules client-side only
  useEffect(() => {
    Promise.all([
      import("@remotion/player").then((m) => m.Player),
      import("@/remotion/DramaVideo").then((m) => m.default),
    ]).then(([PlayerComp, DramaVideoComp]) => {
      setRemotion({ Player: PlayerComp, DramaVideo: DramaVideoComp })
    })
  }, [])

  const lang = getLanguageByCode(previewLang)
  const isRtl = lang?.direction === "rtl"

  const adjustedScenes = useMemo(
    () => (scenes?.length ? ensureReadableDurations(scenes, previewLang) : []),
    [scenes, previewLang]
  )

  // Select the dub for the current preview language (with fallback to primary)
  const previewDubScenes = useMemo(
    () => selectDubForLang(dubScenes, previewLang, defaultDubLang),
    [dubScenes, previewLang, defaultDubLang]
  )

  const totalFrames = useMemo(
    () => calculateTotalFrames(adjustedScenes, FPS, TRANSITION_FRAMES, previewDubScenes),
    [adjustedScenes, previewDubScenes]
  )

  const playerImageUrls = useMemo(
    () => scenes?.map((_, i) => imageUrls[i] || null) || [],
    [scenes, imageUrls]
  )

  async function handleGenerateDub(lang) {
    setDubbingStates((p) => ({ ...p, [lang]: "generating" }))
    setDubErrors((p) => ({ ...p, [lang]: null }))
    try {
      const res = await fetch(`/api/admin/episodes/${episode.id}/generate-dub`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to generate dub")
      onDubScenesChange(data.dubScenes)
      onDefaultDubLangChange(data.defaultDubLang)
    } catch (err) {
      setDubErrors((p) => ({ ...p, [lang]: err.message }))
    }
    setDubbingStates((p) => ({ ...p, [lang]: "idle" }))
  }

  async function handleClearDub(lang) {
    const nested = normalizeDubScenes(dubScenes) || {}
    const updated = { ...nested }
    delete updated[lang]
    const newDubScenes = Object.keys(updated).length > 0 ? updated : null
    const newDefault = recalcDefaultDubLang(nested, lang, defaultDubLang)
    await fetch(`/api/admin/episodes/${episode.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dubScenes: newDubScenes, defaultDubLang: newDefault }),
    })
    onDubScenesChange(newDubScenes)
    onDefaultDubLangChange(newDefault)
  }

  async function handleSetDefaultDub(lang) {
    await fetch(`/api/admin/episodes/${episode.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultDubLang: lang }),
    })
    onDefaultDubLangChange(lang)
  }

  async function handleFixSubtitleSync() {
    setFixingSyncState("fixing")
    try {
      const res = await fetch(`/api/admin/episodes/${episode.id}/fix-subtitle-sync`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setFixingSyncState("done")
      setTimeout(() => setFixingSyncState("idle"), 3000)
    } catch {
      setFixingSyncState("error")
      setTimeout(() => setFixingSyncState("idle"), 3000)
    }
  }

  const handleDownload = (lang) => {
    const url = downloadUrls?.[lang]
    if (!url) return
    const filename = `episode-${episodeNumber}-${lang}.mp4`
    // Use fetch + blob to force a browser download regardless of browser/OS
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed: ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = objectUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(objectUrl)
      })
      .catch((err) => {
        alert(`Download failed: ${err.message}`)
      })
  }

  // Find the first completed export for sharing
  const completedLang = languages.find((l) => statuses?.[l] === "done" && downloadUrls?.[l])

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Video Preview */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="mb-3">
            <h3 className="font-semibold mb-2">Preview</h3>
            {/* Language selector */}
            {languages.length > 1 && (
              <div className="flex gap-1 mb-3">
                {languages.map((l) => (
                  <button
                    key={l}
                    onClick={() => setPreviewLang(l)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors btn-press ${
                      previewLang === l
                        ? "bg-accent/20 text-accent border border-accent/30"
                        : "text-text-muted hover-text bg-input-bg border border-transparent"
                    }`}
                  >
                    {getLanguageByCode(l)?.flag} {l.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
 
          {/* Player */}
          <div className="w-full aspect-[9/16] bg-black rounded-xl overflow-hidden shadow-lg">
            {!remotion ? (
              <div className="w-full h-full flex items-center justify-center">
                <span className="inline-block w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : scenes?.length > 0 ? (
              <remotion.Player
                ref={playerRef}
                component={remotion.DramaVideo}
                inputProps={{
                  scenes,
                  imageUrls: playerImageUrls,
                  language: previewLang,
                  isRtl,
                  fps: FPS,
                  dubScenes: previewDubScenes || undefined,
                  subtitleEnabled,
                  subtitleSize,
                }}
                durationInFrames={Math.max(totalFrames, 1)}
                fps={FPS}
                compositionWidth={1080}
                compositionHeight={1920}
                style={{ width: "100%", height: "100%" }}
                controls
                autoPlay={false}
                loop={false}
                acknowledgeRemotionLicense
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                No scenes
              </div>
            )}
          </div>
        </div>

        {/* Export + Share column */}
        <div className="flex-1 space-y-4">
          {/* Voice Dubs — per language */}
          <div className="p-5 bg-surface border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Voice Dubs</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">★ = primary fallback</span>
                <button
                  onClick={handleFixSubtitleSync}
                  disabled={fixingSyncState === "fixing" || !dubScenes}
                  className="px-2.5 py-1 text-xs font-medium bg-surface-2 border border-border hover:border-accent/50 disabled:opacity-50 text-text-muted hover:text-accent rounded-lg transition-colors"
                >
                  {fixingSyncState === "fixing" ? "Fixing..." : fixingSyncState === "done" ? "✓ Fixed" : fixingSyncState === "error" ? "Error" : "Fix Subtitle Sync"}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {languages.map((lang) => {
                const langMeta = getLanguageByCode(lang)
                const nested = normalizeDubScenes(dubScenes) || {}
                const langDub = nested[lang]
                const sceneCount = scenes?.length || 0
                const dubbedCount = langDub ? Object.keys(langDub).length : 0
                const isGenerating = dubbingStates[lang] === "generating"
                const isDefault = defaultDubLang === lang
                // Auto-default: if only one lang has a dub, treat it as default for display
                const langs = Object.keys(nested)
                const effectiveDefault = defaultDubLang || (langs.length === 1 ? langs[0] : null)
                const isEffectiveDefault = effectiveDefault === lang
                const hasVoiceId = !!(
                  process.env[`NEXT_PUBLIC_HAS_VOICE_${lang.toUpperCase()}`] !== "false"
                )
                const err = dubErrors[lang]

                return (
                  <div key={lang} className="flex items-center gap-3 p-3 bg-surface-2 rounded-lg">
                    {/* Flag + lang */}
                    <span className="text-sm w-24 flex-shrink-0 font-medium">
                      {langMeta?.flag} {langMeta?.name || lang.toUpperCase()}
                    </span>

                    {/* Scene dots */}
                    <div className="flex gap-1 flex-1">
                      {Array.from({ length: sceneCount }).map((_, i) => (
                        <div
                          key={i}
                          title={`Scene ${i + 1}: ${langDub?.[String(i)] ? "dubbed" : "not dubbed"}`}
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${langDub?.[String(i)] ? "bg-green-500" : "bg-border"}`}
                        />
                      ))}
                    </div>

                    {/* Star / default button */}
                    <button
                      onClick={() => langDub && handleSetDefaultDub(lang)}
                      disabled={!langDub}
                      title={langDub ? (isEffectiveDefault ? "Primary dub" : "Set as primary") : "No dub yet"}
                      className={`text-base transition-colors flex-shrink-0 ${
                        langDub
                          ? isEffectiveDefault
                            ? "text-yellow-400"
                            : "text-border hover:text-yellow-400"
                          : "text-border/30 cursor-default"
                      }`}
                    >
                      ★
                    </button>

                    {/* Error */}
                    {err && <span className="text-xs text-red-400 flex-shrink-0 max-w-[80px] truncate" title={err}>{err}</span>}

                    {/* Generate / Regenerate / Clear */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleGenerateDub(lang)}
                        disabled={isGenerating}
                        className="px-2.5 py-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                      >
                        {isGenerating ? (
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            …
                          </span>
                        ) : langDub ? "Regen" : "Generate"}
                      </button>
                      {langDub && (
                        <button
                          onClick={() => handleClearDub(lang)}
                          className="text-xs text-text-muted hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Export buttons */}
          <div className="p-5 bg-surface border border-border rounded-xl">
            <h3 className="font-semibold mb-3">Export Video</h3>
            <p className="text-sm text-text-muted mb-4">
              Preview the video, then export as MP4.
            </p>
            <button
              onClick={() => onWatermarkChange(!showWatermark)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors mb-3 ${showWatermark ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border hover:border-border"}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🔏</span>
                <div className="text-left">
                  <p className="text-sm font-medium">Watermark</p>
                  <p className="text-xs text-text-muted">{showWatermark ? "Will appear on exported video" : "Hidden in exported video"}</p>
                </div>
              </div>
              <div className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 overflow-hidden ${showWatermark ? "bg-accent" : "bg-surface-2 border border-border"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showWatermark ? "translate-x-6" : "translate-x-0"}`} />
              </div>
            </button>
            <div className="flex items-center gap-2 px-1 mb-4">
              <span className="text-sm text-text-muted flex-1">💬 Subtitles</span>
              {subtitleEnabled && (
                <div className="flex items-center bg-input-bg rounded-lg overflow-hidden border border-border">
                  {[["S", 44], ["M", 62], ["L", 82]].map(([label, size]) => (
                    <button
                      key={label}
                      onClick={() => onSubtitleSizeChange(size)}
                      className={`px-3 py-1 text-xs font-medium transition-colors btn-press ${subtitleSize === size ? "bg-accent/20 text-accent" : "text-text-muted hover-text"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => onSubtitleEnabledChange(!subtitleEnabled)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 overflow-hidden ${subtitleEnabled ? "bg-accent" : "bg-surface-2 border border-border"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${subtitleEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="space-y-2">
              {languages.map((lang) => {
                const l = getLanguageByCode(lang)
                const status = statuses?.[lang] || "idle"
                const downloadUrl = downloadUrls?.[lang]
                const error = errors?.[lang]

                return (
                  <div key={lang} className="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                    <span className="text-sm">{l?.flag} {l?.name} ({lang.toUpperCase()})</span>
                    <div className="flex items-center gap-2">
                      {status === "idle" && (
                        <button
                          onClick={() => onExport(lang)}
                          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg font-medium transition-colors btn-press"
                        >
                          Export MP4
                        </button>
                      )}
                      {status === "exporting" && (
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <span className="inline-block w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                            Rendering {progresses[lang] || 0}%
                          </div>
                          <div className="w-24 h-1 bg-input-bg rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-accent transition-all duration-500" 
                              style={{ width: `${progresses[lang] || 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {status === "done" && downloadUrl && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(lang)}
                            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs rounded-lg font-medium transition-colors btn-press"
                          >
                            ⬇ Download
                          </button>
                          <button
                            onClick={() => reset(lang)}
                            className="text-xs text-text-muted hover:text-text-primary"
                          >
                            Re-export
                          </button>
                        </div>
                      )}
                      {status === "error" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">{error || "Failed"}</span>
                          <button
                            onClick={() => onExport(lang)}
                            className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg font-medium transition-colors btn-press"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Share Panel — appears after any export is done */}
          {completedLang && (
            <SharePanel
              downloadUrl={downloadUrls[completedLang]}
              downloadFilename={`episode-${episodeNumber}-${completedLang}.mp4`}
              seriesTitle={series?.title}
              episodeNumber={episodeNumber}
              episodeTitle={episode?.title}
              summary={episode?.summary}
              language={completedLang}
            />
          )}
        </div>
      </div>
    </div>
  )
}
