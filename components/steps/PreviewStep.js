"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Player } from "@remotion/player"
import DramaVideo from "@/remotion/DramaVideo"
import { calculateTotalFrames, getSceneStartFrame, ensureReadableDurations } from "@/lib/subtitleUtils"
import { getLanguageByCode } from "@/config/languages"
import { Music, Play as PlayIcon, Pause, Volume2, VolumeX, RotateCcw } from "lucide-react"

const FPS = 30
const TRANSITION_FRAMES = 15

export default function PreviewStep({ scenes, images, languages, onNext, onBack, musicTrack, onMusicChange, onResetStep }) {
  const [activeLang, setActiveLang] = useState(languages[0] || "en")
  const playerRef = useRef(null)
  const [audioTracks, setAudioTracks] = useState([])
  const [previewAudio, setPreviewAudio] = useState(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    fetch("/api/admin/audio-tracks")
      .then((r) => r.json())
      .then((data) => {
        const tracks = Array.isArray(data) ? data : (data.tracks || [])
        setAudioTracks(tracks)
      })
      .catch(() => {})
  }, [])

  // Stop preview audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  function handlePreviewTrack(trackId) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (previewAudio === trackId) {
      setPreviewAudio(null)
      setPreviewPlaying(false)
      return
    }

    const track = audioTracks.find((t) => t.id === trackId)
    if (!track?.available) return

    const audio = new Audio(track.file)
    audio.volume = 0.4
    audio.play().catch(() => {})
    audio.addEventListener("ended", () => {
      setPreviewAudio(null)
      setPreviewPlaying(false)
    })
    audioRef.current = audio
    setPreviewAudio(trackId)
    setPreviewPlaying(true)
  }

  const lang = getLanguageByCode(activeLang)
  const isRtl = lang?.direction === "rtl"

  const adjustedScenes = useMemo(
    () => ensureReadableDurations(scenes, activeLang),
    [scenes, activeLang]
  )

  const totalFrames = useMemo(
    () => calculateTotalFrames(adjustedScenes, FPS, TRANSITION_FRAMES),
    [adjustedScenes]
  )

  const imageUrls = useMemo(
    () => scenes?.map((_, i) => images[i]?.url || null) || [],
    [scenes, images]
  )

  const seekToScene = useCallback((sceneIndex) => {
    const frame = getSceneStartFrame(adjustedScenes, sceneIndex, FPS, TRANSITION_FRAMES)
    playerRef.current?.seekTo(frame)
  }, [adjustedScenes])

  if (!scenes) return null

  const textKey = `text_${activeLang}`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-serif font-bold">Preview</h2>
        <div className="flex gap-1">
          {languages.map((l) => (
            <button
              key={l}
              onClick={() => setActiveLang(l)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                activeLang === l
                  ? "bg-accent/20 text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {getLanguageByCode(l)?.flag} {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-center mb-8">
        {/* Remotion Player in phone frame */}
        <div className="relative">
          <div className="w-[280px] h-[560px] bg-zinc-900 rounded-[2.5rem] p-3 shadow-2xl border border-zinc-800">
            {/* Notch */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-zinc-900 rounded-b-2xl z-10" />
            {/* Screen */}
            <div className="w-full h-full rounded-[2rem] overflow-hidden bg-black">
              <Player
                ref={playerRef}
                component={DramaVideo}
                inputProps={{
                  scenes,
                  imageUrls,
                  language: activeLang,
                  isRtl,
                  fps: FPS,
                  musicUrl: musicTrack ? audioTracks.find((t) => t.id === musicTrack)?.file : null,
                }}
                durationInFrames={Math.max(totalFrames, 1)}
                fps={FPS}
                compositionWidth={1080}
                compositionHeight={1920}
                style={{ width: "100%", height: "100%" }}
                controls
                autoPlay={false}
                loop
                acknowledgeRemotionLicense
              />
            </div>
            {/* Home indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 bg-zinc-700 rounded-full" />
          </div>
        </div>

        {/* Scene Navigation */}
        <div className="w-64">
          <h3 className="text-sm font-semibold mb-3">Scenes</h3>
          <div className="space-y-2">
            {scenes.map((s, i) => (
              <button
                key={i}
                onClick={() => seekToScene(i)}
                className="w-full text-left p-3 rounded-lg border border-border bg-surface hover:border-text-muted transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-muted">
                    #{i + 1} {s.type?.replace("_", " ")}
                  </span>
                  <span className="text-xs text-text-muted">{s.duration_sec}s</span>
                </div>
                <p className="text-xs text-text-muted mt-1 line-clamp-2">
                  {s[textKey] || ""}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Music Selection */}
      {audioTracks.length > 0 && (
        <div className="mb-8 p-5 bg-surface border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Music className="w-4 h-4 text-accent" />
            Background Music
          </h3>
          <div className="space-y-2">
            {/* No music option */}
            <button
              onClick={() => {
                onMusicChange?.(null)
                if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
                setPreviewAudio(null)
                setPreviewPlaying(false)
              }}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                !musicTrack
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface-2 hover:border-text-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <VolumeX className="w-4 h-4 text-text-muted" />
                <span className="text-sm">No music</span>
              </div>
              {!musicTrack && <span className="text-xs text-accent font-medium">Selected</span>}
            </button>

            {audioTracks.map((track) => (
              <div
                key={track.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  musicTrack === track.id
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface-2"
                } ${!track.available ? "opacity-40" : ""}`}
              >
                <button
                  onClick={() => track.available && onMusicChange?.(track.id)}
                  className="flex-1 text-left flex items-center gap-2"
                  disabled={!track.available}
                >
                  <Volume2 className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{track.name}</p>
                    <p className="text-[11px] text-text-muted">{track.mood}</p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  {musicTrack === track.id && <span className="text-xs text-accent font-medium">Selected</span>}
                  {track.available ? (
                    <button
                      onClick={() => handlePreviewTrack(track.id)}
                      className="w-7 h-7 rounded-full bg-overlay flex items-center justify-center hover:bg-overlay-strong transition-colors"
                      title="Preview"
                    >
                      {previewAudio === track.id && previewPlaying ? (
                        <Pause className="w-3.5 h-3.5 text-text-primary" />
                      ) : (
                        <PlayIcon className="w-3.5 h-3.5 text-text-primary ml-0.5" />
                      )}
                    </button>
                  ) : (
                    <span className="text-[10px] text-text-muted">Not available</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-muted mt-3">
            Place royalty-free MP3 files in <code className="text-accent">/public/audio/</code> to enable tracks.
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-5 py-2.5 border border-border text-text-muted hover:text-text-primary rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
        >
          Next: Export
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
