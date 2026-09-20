"use client"

import Link from "next/link"
import { Eye, EyeOff, Trash2 } from "lucide-react"
import {
  episodeBlurb,
  episodeCardAction,
  episodeCardCtaLabel,
  episodeDurationSec,
  episodeHasAudio,
  episodePipelineLabels,
  isUsableEpisodeStill,
  sceneCount,
} from "@/lib/episode-watch"

export default function EpisodeCard({
  ep,
  seriesId,
  thumbnail,
  hasRender,
  toggling,
  onTogglePublish,
  onDelete,
  onWatchClick,
}) {
  const action = episodeCardAction(ep, hasRender)
  const watchable = action === "watch"
  const still = isUsableEpisodeStill(thumbnail) ? thumbnail : null
  const scenes = sceneCount(ep)
  const duration = episodeDurationSec(ep)
  const blurb = episodeBlurb(ep)
  const pipeline = episodePipelineLabels({
    hasStill: Boolean(still),
    hasAudio: episodeHasAudio(ep),
    hasRender: Boolean(hasRender),
  })
  const ctaLabel = episodeCardCtaLabel(action)
  const href = watchable ? "#episode-watch" : `/admin/series/${seriesId}/episode/${ep.episodeNumber}`
  const title = ep.title || `Episode ${ep.episodeNumber}`
  const isCompleted = ep.status === "completed"

  function handleCtaClick(event) {
    if (!watchable) return
    onWatchClick?.(event)
  }

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-brand/30">
      <div className="relative aspect-[3/4] overflow-hidden bg-[#0B1020]">
        {still ? (
          <img
            src={still}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="kineva-episode-fallback absolute inset-0">
            <div className="relative z-10 flex h-full flex-col justify-end p-5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand">
                Episode {ep.episodeNumber}
              </span>
              <h3 className="mt-2 font-serif text-2xl leading-tight text-[#F4EFE6] line-clamp-3">
                {title}
              </h3>
            </div>
          </div>
        )}
        <div className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-[#0B1020]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand backdrop-blur-sm">
          Episode {ep.episodeNumber}
        </div>
      </div>

      <div className="p-4">
        {still ? (
          <h3 className="font-serif text-xl leading-tight text-text-primary">
            {title}
          </h3>
        ) : null}

        {blurb ? (
          <p className={`text-sm leading-relaxed text-text-muted line-clamp-3 ${still ? "mt-2" : ""}`}>
            {blurb}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
          {scenes > 0 && <span>{scenes} scene{scenes === 1 ? "" : "s"}</span>}
          {duration > 0 && (
            <>
              {scenes > 0 && <span className="text-text-muted">·</span>}
              <span>~{duration} sec</span>
            </>
          )}
          {ep.status && (
            <>
              <span className="text-text-muted">·</span>
              <span className="capitalize">{isCompleted ? "Completed" : ep.status.replace(/_/g, " ")}</span>
            </>
          )}
          {isCompleted && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              ep.published
                ? "bg-green-500/15 text-green-400"
                : "bg-surface-2 text-text-muted"
            }`}>
              {ep.published ? "Published" : "Draft"}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatusChip label={pipeline.visual} ready={Boolean(still)} />
          <StatusChip label={pipeline.audio} ready={episodeHasAudio(ep)} />
          <StatusChip label={pipeline.video} ready={Boolean(hasRender)} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          {watchable ? (
            <a
              href={href}
              onClick={handleCtaClick}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-accent-hover btn-press"
            >
              {ctaLabel}
            </a>
          ) : (
            <Link
              href={href}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-accent-hover btn-press"
            >
              {ctaLabel}
            </Link>
          )}
          {isCompleted && (
            <button
              disabled={toggling}
              onClick={onTogglePublish}
              title={ep.published ? "Unpublish" : "Publish"}
              className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
                ep.published
                  ? "text-green-400 hover:bg-surface-2"
                  : "text-text-muted hover:bg-surface-2 hover:text-green-400"
              }`}
            >
              {toggling ? (
                <span className="text-xs">…</span>
              ) : ep.published ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  )
}

function StatusChip({ label, ready }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
      ready ? "bg-secondary/15 text-secondary" : "bg-surface-2 text-text-muted"
    }`}>
      {label}
    </span>
  )
}
