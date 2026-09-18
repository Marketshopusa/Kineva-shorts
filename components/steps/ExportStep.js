"use client"

import { useState, useEffect } from "react"
import { getLanguageByCode } from "@/config/languages"
import { getTrackById } from "@/config/audioTracks"
import SharePanel from "@/components/ui/SharePanel"
import { CheckCircle2, Loader2, XCircle, ExternalLink } from "lucide-react"

// Stage definitions for the publish flow
const PUBLISH_STAGES = [
  { key: "summarize",  label: "Summarizing episode..." },
  { key: "finalize",   label: "Publishing episode..." },
  { key: "done",       label: "Published!" },
]

export default function ExportStep({
  scenes, images, series, seriesId, onPublish, onBack,
  exportHook, episodeTitle, episodeSummary, episodeNumber,
  musicTrack,
}) {
  const [publishStage, setPublishStage] = useState(null) // null | stage key | "done" | "error"
  const [publishError, setPublishError] = useState(null)
  const [watermarkEnabled, setWatermarkEnabled] = useState(true)
  const [watermarkText, setWatermarkText] = useState("KINEVA")
  const [watermarkSize, setWatermarkSize] = useState(48)
  const [watermarkColor, setWatermarkColor] = useState("#FFFFFF")
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.4)
  const { statuses, downloadUrls, progresses, errors, exportVideo, reset } = exportHook || {}

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setWatermarkEnabled(data.watermarkEnabled ?? true)
        setWatermarkText(data.watermarkText || "KINEVA")
        setWatermarkSize(data.watermarkSize ?? 48)
        setWatermarkColor(data.watermarkColor ?? "#FFFFFF")
        setWatermarkOpacity(data.watermarkOpacity ?? 0.4)
      })
      .catch(() => {})
  }, [])

  async function handlePublish() {
    setPublishStage("summarize")
    setPublishError(null)
    try {
      await onPublish(setPublishStage)
      setPublishStage("done")
    } catch (err) {
      setPublishError(err.message || "Something went wrong")
      setPublishStage("error")
    }
  }

  function handleExport(lang) {
    const l = getLanguageByCode(lang)
    const track = musicTrack ? getTrackById(musicTrack) : null
    exportVideo({
      scenes,
      images,
      language: lang,
      isRtl: l?.direction === "rtl",
      watermark: watermarkEnabled,
      watermarkText,
      watermarkSize,
      watermarkColor,
      watermarkOpacity,
      musicUrl: track?.file || null,
    })
  }

  const approvedCount = Object.values(images).filter((i) => i?.approved).length
  const totalDuration = scenes?.reduce((sum, s) => sum + (s.duration_sec || 0), 0) || 0
  const isPublishing = publishStage && publishStage !== "done" && publishStage !== "error"
  const isPublished  = publishStage === "done"

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-serif font-bold mb-6">Export & Publish</h2>

      <div className="space-y-4 mb-8">
        {/* Episode Summary card */}
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="font-semibold mb-3">Episode Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-muted">Scenes</span>
              <div className="font-medium">{scenes?.length || 0}</div>
            </div>
            <div>
              <span className="text-text-muted">Duration</span>
              <div className="font-medium">{totalDuration}s</div>
            </div>
            <div>
              <span className="text-text-muted">Images Approved</span>
              <div className="font-medium">{approvedCount}/{scenes?.length || 0}</div>
            </div>
            <div>
              <span className="text-text-muted">Languages</span>
              <div className="font-medium">{series?.languages?.map((l) => l.toUpperCase()).join(", ")}</div>
            </div>
          </div>
        </div>

        {/* ─── PUBLISH EPISODE ─── */}
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="font-semibold mb-3">Publish Episode</h3>

          {/* Progress stages */}
          {isPublishing && (
            <div className="mb-4 space-y-2">
              {PUBLISH_STAGES.filter((s) => s.key !== "done").map((stage) => {
                const active  = publishStage === stage.key
                const done    = PUBLISH_STAGES.findIndex((s) => s.key === publishStage) >
                                PUBLISH_STAGES.findIndex((s) => s.key === stage.key)
                return (
                  <div key={stage.key} className={`flex items-center gap-2.5 text-sm ${active ? "text-text-primary" : done ? "text-green-400" : "text-text-muted"}`}>
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    ) : active ? (
                      <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-card-border shrink-0" />
                    )}
                    {stage.label}
                  </div>
                )
              })}
            </div>
          )}

          {/* Success state */}
          {isPublished && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-400">Episode published!</p>
                <p className="text-sm text-text-secondary mt-1">
                  {series?.title} — Episode {episodeNumber} is now live.
                </p>
                {seriesId && (
                  <a
                    href={`/watch/${seriesId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    View public page <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {publishStage === "error" && (
            <div className="mb-4 p-4 bg-accent/10 border border-accent/20 rounded-xl flex items-start gap-3">
              <XCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-accent">Publish failed</p>
                <p className="text-sm text-text-muted mt-1">{publishError}</p>
              </div>
              <button
                onClick={handlePublish}
                className="text-xs text-accent hover:text-accent-hover border border-accent/30 px-2.5 py-1 rounded-lg transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {!isPublished && !isPublishing && (
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              Publish Episode
            </button>
          )}
        </div>

        {/* ─── DOWNLOAD VIDEOS (optional) ─── */}
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="font-semibold mb-1">Download Videos <span className="text-text-muted font-normal text-sm">(optional)</span></h3>
          <p className="text-xs text-text-muted mb-3">Render and download MP4 files — you can publish the episode first and download later.</p>
          <label className="flex items-center justify-between p-3 bg-surface-2 rounded-lg mb-3 cursor-pointer select-none">
            <span className="text-sm">Include KINEVA watermark</span>
            <div
              onClick={() => setWatermarkEnabled((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${watermarkEnabled ? "bg-accent" : "bg-card-border"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${watermarkEnabled ? "translate-x-5" : ""}`} />
            </div>
          </label>
          <div className="space-y-2">
            {series?.languages?.map((lang) => {
              const l = getLanguageByCode(lang)
              const status = statuses?.[lang] || "idle"
              const downloadUrl = downloadUrls?.[lang]
              const err = errors?.[lang]

              return (
                <div key={lang} className={`flex ${status === "exporting" ? "flex-col items-stretch gap-2.5" : "items-center justify-between"} p-3 bg-surface-2 rounded-lg`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{l?.flag} {l?.name} ({lang.toUpperCase()})</span>
                    
                    <div className="flex items-center gap-2">
                      {status === "idle" && (
                        <button
                          onClick={() => handleExport(lang)}
                          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg font-medium transition-colors"
                        >
                          Export MP4
                        </button>
                      )}
                      
                      {status === "done" && downloadUrl && (
                        <div className="flex items-center gap-2">
                          <a
                            href={downloadUrl}
                            download={`episode-${lang}.mp4`}
                            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs rounded-lg font-medium transition-colors"
                          >
                            Download
                          </a>
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
                          <span className="text-xs text-red-400">{err || "Failed"}</span>
                          <button
                            onClick={() => handleExport(lang)}
                            className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg font-medium transition-colors"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {status === "exporting" && (
                    <div className="w-full space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-text-muted">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                          Rendering...
                        </div>
                        <span className="font-medium text-accent">{progresses?.[lang] || 0}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-card-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-300 ease-out"
                          style={{ width: `${progresses?.[lang] || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Cost Estimate */}
        <div className="p-5 bg-surface border border-border rounded-xl">
          <h3 className="font-semibold mb-3">Estimated Cost</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Screenplay (Claude Haiku)</span>
              <span>~$0.01</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Image prompts (6x Claude Haiku)</span>
              <span>~$0.01</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Images (6x Leonardo AI)</span>
              <span>varies</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Summarization (Claude Haiku)</span>
              <span>~$0.01</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border font-medium">
              <span>Total</span>
              <span>~$0.21</span>
            </div>
          </div>
        </div>

        {/* Share panel — after any export is done */}
        {(() => {
          const completedLang = series?.languages?.find((l) => statuses?.[l] === "done" && downloadUrls?.[l])
          if (!completedLang) return null
          return (
            <SharePanel
              downloadUrl={downloadUrls[completedLang]}
              downloadFilename={`episode-${completedLang}.mp4`}
              seriesTitle={series?.title}
              episodeNumber={episodeNumber}
              episodeTitle={episodeTitle}
              summary={episodeSummary}
              language={completedLang}
            />
          )
        })()}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={isPublishing}
          className="px-5 py-2.5 border border-border text-text-muted hover:text-text-primary disabled:opacity-50 rounded-lg transition-colors"
        >
          Back
        </button>
        {isPublished && (
          <a
            href={`/admin/series/${seriesId}`}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            Go to Series
          </a>
        )}
      </div>
    </div>
  )
}
