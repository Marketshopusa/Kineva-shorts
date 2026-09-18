"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import {
  loadSeries, loadCharacters, loadEpisodes,
  createEpisode, updateEpisode, deleteEpisode, loadImages, saveImage, finalizeEpisode,
} from "@/lib/storage-api"
import { apiFetch } from "@/lib/api"
import { useScreenplay } from "@/hooks/useScreenplay"
import { useVisuals } from "@/hooks/useVisuals"
import { useExport } from "@/hooks/useExport"
import SetupStep from "@/components/steps/SetupStep"
import ScreenplayStep from "@/components/steps/ScreenplayStep"
import VisualStep from "@/components/steps/VisualStep"
import PreviewStep from "@/components/steps/PreviewStep"
import ExportStep from "@/components/steps/ExportStep"
import StepIndicator from "@/components/ui/StepIndicator"
import Breadcrumb from "@/components/ui/Breadcrumb"
import { RotateCcw } from "lucide-react"

const STEPS = ["Setup", "Screenplay", "Visuals", "Preview", "Export"]
const STEP_NAMES = ["Setup", "Screenplay", "Visuals", "Preview", "Export"]

export default function EpisodeFlowPage({ params }) {
  const { id } = use(params)
  const seriesId = Number(id)
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [series, setSeries] = useState(null)
  const [characters, setCharacters] = useState([])
  const [episodes, setEpisodes] = useState([])
  const [episodeId, setEpisodeId] = useState(null)
  const [episodeNumber, setEpisodeNumber] = useState(1)
  const [direction, setDirection] = useState("")
  const [previousScreenplay, setPreviousScreenplay] = useState(null)
  const [musicTrack, setMusicTrack] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isResuming, setIsResuming] = useState(false)
  const [resumeStep, setResumeStep] = useState(null)
  const [startingOver, setStartingOver] = useState(false)

  const screenplay = useScreenplay()
  const visuals = useVisuals()
  const exportHook = useExport()

  useEffect(() => {
    loadData()
  }, [seriesId])

  async function loadData() {
    const [s, chars, eps] = await Promise.all([
      loadSeries(seriesId),
      loadCharacters(seriesId),
      loadEpisodes(seriesId),
    ])
    setSeries(s)
    setCharacters(chars)
    setEpisodes(eps)

    // Check for in-progress episode to resume
    const inProgress = eps.find((e) => e.status !== "completed")
    if (inProgress) {
      setEpisodeId(inProgress.id)
      setEpisodeNumber(inProgress.episodeNumber)
      setDirection(inProgress.direction || "")
      if (inProgress.musicTrack) setMusicTrack(inProgress.musicTrack)

      // Restore screenplay scenes
      if (inProgress.screenplay?.scenes) {
        screenplay.setScenes(inProgress.screenplay.scenes)
      }

      // Restore images from DB
      const imgs = await loadImages(inProgress.id)
      if (imgs.length > 0) {
        const restoredImages = {}
        for (const img of imgs) {
          restoredImages[img.sceneIndex] = {
            url: img.url,
            prompt: img.prompt,
            approved: true,
          }
        }
        visuals.setImages(restoredImages)
      }

      // Determine which step to resume at based on status
      const statusStepMap = {
        screenplay: 1,
        visuals: 2,
        preview: 3,
        export: 4,
      }
      const resumedStep = statusStepMap[inProgress.status] || 0
      setStep(resumedStep)
      setIsResuming(true)
      setResumeStep(resumedStep)

      // Load previous episode's screenplay for continuity (before this one)
      const prevEps = eps.filter((e) => e.episodeNumber < inProgress.episodeNumber)
      if (prevEps.length > 0) {
        const prevEp = prevEps[prevEps.length - 1]
        if (prevEp.screenplay) setPreviousScreenplay(prevEp.screenplay)
      }
    } else {
      const nextNum = eps.length + 1
      setEpisodeNumber(nextNum)

      // Load previous episode's screenplay for continuity
      if (eps.length > 0) {
        const prevEp = eps[eps.length - 1]
        if (prevEp.screenplay) {
          setPreviousScreenplay(prevEp.screenplay)
        }
      }
    }

    setLoading(false)
  }

  async function handleStartOver() {
    if (!episodeId) return
    setStartingOver(true)
    try {
      await deleteEpisode(episodeId)
    } catch (err) {
      console.error("Failed to delete episode:", err)
    }
    // Reset all state
    setEpisodeId(null)
    setDirection("")
    setMusicTrack(null)
    screenplay.setScenes(null)
    visuals.setImages({})
    setStep(0)
    setIsResuming(false)
    setResumeStep(null)
    // Reload episode count
    const eps = await loadEpisodes(seriesId)
    setEpisodes(eps)
    setEpisodeNumber(eps.filter((e) => e.status === "completed").length + 1)
    setStartingOver(false)
  }

  // Auto-save direction to DB on blur (only when resuming an existing episode)
  async function handleDirectionBlur() {
    if (episodeId && direction !== undefined) {
      updateEpisode(episodeId, { direction }).catch(() => {})
    }
  }

  async function handleGenerateScreenplay() {
    const scenes = await screenplay.generateScreenplay({
      series,
      characters,
      episodeNumber,
      direction,
      previousScreenplay,
    })

    if (scenes) {
      // Create episode in DB
      const epId = await createEpisode({
        seriesId,
        episodeNumber,
        title: `Episode ${episodeNumber}`,
        status: "screenplay",
        direction,
        screenplay: { scenes },
      })
      setEpisodeId(epId)
      setStep(1)
    }
  }

  async function handleScreenplayNext() {
    if (episodeId && screenplay.scenes) {
      await updateEpisode(episodeId, {
        screenplay: { scenes: screenplay.scenes },
        status: "visuals",
      })
    }
    setStep(2)
  }

  async function handleVisualsNext() {
    if (episodeId) {
      // Save images to DB via API
      for (const [idx, img] of Object.entries(visuals.images)) {
        if (img.url) {
          await saveImage(episodeId, Number(idx), img.url, img.prompt)
        }
      }
      await updateEpisode(episodeId, { status: "preview" })
    }
    setStep(3)
  }

  async function handlePublish(onStage) {
    if (!episodeId || !screenplay.scenes) throw new Error("Missing episode data")

    onStage?.("summarize")
    const summaryData = await apiFetch("/api/admin/summarize", {
      method: "POST",
      body: JSON.stringify({
        screenplay: screenplay.scenes,
        seriesTitle: series.title,
        episodeNumber,
        seriesId: series.id,
      }),
    })

    onStage?.("finalize")
    await finalizeEpisode(episodeId, summaryData)
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-surface rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: series?.title || "Series", href: `/admin/series/${seriesId}` },
        { label: episodeId ? `Episode ${episodeNumber}` : `New Episode ${episodeNumber}` },
      ]} />

      <StepIndicator
        steps={STEPS}
        currentStep={step}
        onStepClick={(i) => i < step && setStep(i)}
      />

      {/* Resume banner */}
      {isResuming && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-xl text-sm">
          <span className="text-text-secondary flex-1">
            Resuming <span className="font-medium text-text-primary">Episode {episodeNumber}</span> — you left off at <span className="font-medium text-text-primary">{STEP_NAMES[resumeStep]}</span>
          </span>
          <button
            onClick={handleStartOver}
            disabled={startingOver}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent border border-card-border hover:border-accent/30 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
          >
            <RotateCcw className={`w-3 h-3 ${startingOver ? "animate-spin" : ""}`} />
            {startingOver ? "Resetting..." : "Start Over"}
          </button>
        </div>
      )}

      {/* Step Content */}
      <div key={step} className="animate-step-in">
      {step === 0 && (
        <SetupStep
          series={series}
          direction={direction}
          onDirectionChange={setDirection}
          onDirectionBlur={handleDirectionBlur}
          onGenerate={handleGenerateScreenplay}
          loading={screenplay.loading}
          error={screenplay.error}
          characters={characters}
          episodeNumber={episodeNumber}
          previousScreenplay={previousScreenplay}
          onAutoPilotDone={(epId) => {
            // Navigate to series page after auto-pilot completes
            router.push(`/admin/series/${seriesId}`)
          }}
          onResetStep={episodeId ? async () => {
            await updateEpisode(episodeId, { status: "setup", screenplay: null })
            screenplay.setScenes(null)
            setIsResuming(false)
          } : null}
        />
      )}

      {step === 1 && (
        <ScreenplayStep
          scenes={screenplay.scenes}
          languages={series?.languages || ["en"]}
          series={series}
          characters={characters}
          episodeId={episodeId}
          previousCliffhanger={series?.lastCliffhanger}
          onUpdateScene={(idx, updates) => {
            screenplay.updateScene(idx, updates)
            // Debounced auto-save screenplay to DB
            if (episodeId) {
              clearTimeout(window.__screenplaySaveTimer)
              window.__screenplaySaveTimer = setTimeout(() => {
                screenplay.scenes && updateEpisode(episodeId, {
                  screenplay: { scenes: screenplay.scenes },
                }).catch(() => {})
              }, 2000)
            }
          }}
          onNext={handleScreenplayNext}
          onBack={() => setStep(0)}
          onRegenerate={async () => {
            // Regenerate screenplay, keeping existing direction
            const scenes = await screenplay.generateScreenplay({
              series, characters, episodeNumber, direction, previousScreenplay,
            })
            if (scenes && episodeId) {
              await updateEpisode(episodeId, { screenplay: { scenes } })
            }
          }}
          onRegenerateWithFeedback={(hint) => {
            // Pre-fill direction with quality feedback and go back to setup
            setDirection((prev) => prev ? `${prev}\n\n${hint}` : hint)
            setStep(0)
          }}
          onResetStep={episodeId ? async () => {
            await updateEpisode(episodeId, { status: "screenplay", screenplay: null })
            screenplay.setScenes(null)
            setStep(0)
          } : null}
        />
      )}

      {step === 2 && (
        <VisualStep
          scenes={screenplay.scenes}
          images={visuals.images}
          statuses={visuals.statuses}
          characters={characters}
          series={series}
          episodeNumber={episodeNumber}
          onGenerateImage={(scene, idx, provider, autoApprove, seriesOverride) => visuals.generateImage(scene, idx, characters, seriesOverride || series, provider, autoApprove)}
          onGenerateAll={(provider, autoApprove, seriesOverride) => visuals.generateAll(screenplay.scenes, characters, seriesOverride || series, provider, autoApprove)}
          onApprove={visuals.approveImage}
          onNext={handleVisualsNext}
          onBack={() => setStep(1)}
          error={visuals.error}
          onResetStep={episodeId ? async () => {
            await updateEpisode(episodeId, { status: "visuals" })
            visuals.setImages({})
            setStep(1)
          } : null}
        />
      )}

      {step === 3 && (
        <PreviewStep
          scenes={screenplay.scenes}
          images={visuals.images}
          languages={series?.languages || ["en"]}
          musicTrack={musicTrack}
          onMusicChange={(track) => {
            setMusicTrack(track)
            if (episodeId) {
              updateEpisode(episodeId, { musicTrack: track || null }).catch(() => {})
            }
          }}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
          onResetStep={episodeId ? async () => {
            await updateEpisode(episodeId, { status: "preview" })
            setStep(2)
          } : null}
        />
      )}

      {step === 4 && (
        <ExportStep
          scenes={screenplay.scenes}
          images={visuals.images}
          series={series}
          seriesId={seriesId}
          episodeNumber={episodeNumber}
          musicTrack={musicTrack}
          onPublish={handlePublish}
          onBack={() => setStep(3)}
          exportHook={exportHook}
        />
      )}
      </div>
    </div>
  )
}
