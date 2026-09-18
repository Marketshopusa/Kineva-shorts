"use client"

import { useState } from "react"
import { Copy, Check, ExternalLink, Download, Hash } from "lucide-react"

function InstagramIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function TikTokIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.98a8.28 8.28 0 0 0 4.76 1.5v-3.5a4.85 4.85 0 0 1-1-.29z" />
    </svg>
  )
}

function YoutubeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

const PLATFORMS = [
  {
    id: "instagram",
    name: "Instagram Reels",
    icon: InstagramIcon,
    color: "from-purple-500 to-pink-500",
    uploadUrl: "https://www.instagram.com/reels/create/",
    specs: "9:16 / max 90s / MP4",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: TikTokIcon,
    color: "from-cyan-400 to-pink-500",
    uploadUrl: "https://www.tiktok.com/upload",
    specs: "9:16 / max 10min / MP4",
  },
  {
    id: "youtube",
    name: "YouTube Shorts",
    icon: YoutubeIcon,
    color: "from-red-600 to-red-500",
    uploadUrl: "https://studio.youtube.com/channel/UC/videos/upload?d=ud",
    specs: "9:16 / max 60s / MP4",
  },
]

function generateCaption({ seriesTitle, episodeNumber, episodeTitle, summary, language }) {
  const lang = language?.toUpperCase() || ""
  const lines = []

  if (episodeTitle) {
    lines.push(`${seriesTitle} — EP${episodeNumber}: ${episodeTitle}`)
  } else {
    lines.push(`${seriesTitle} — Episode ${episodeNumber}`)
  }

  if (summary) {
    // Truncate summary to ~150 chars for social media
    const short = summary.length > 150 ? summary.slice(0, 147) + "..." : summary
    lines.push("")
    lines.push(short)
  }

  lines.push("")
  lines.push(`#ShortDrama #OriginalDrama #${seriesTitle.replace(/[^a-zA-Z0-9]/g, "")} #Episode${episodeNumber} #${lang} #DramaSeries #KINEVA`)

  return lines.join("\n")
}

function generateHashtags({ seriesTitle }) {
  return `#ShortDrama #OriginalDrama #${seriesTitle.replace(/[^a-zA-Z0-9]/g, "")} #DramaSeries #KINEVA #ShortFilm #MustWatch`
}

export default function SharePanel({
  downloadUrl,
  downloadFilename,
  seriesTitle,
  episodeNumber,
  episodeTitle,
  summary,
  language,
}) {
  const [copiedField, setCopiedField] = useState(null)
  const [editCaption, setEditCaption] = useState(false)

  const defaultCaption = generateCaption({
    seriesTitle: seriesTitle || "Untitled",
    episodeNumber: episodeNumber || 1,
    episodeTitle,
    summary,
    language,
  })

  const [caption, setCaption] = useState(defaultCaption)
  const hashtags = generateHashtags({ seriesTitle: seriesTitle || "Untitled" })

  async function copyToClipboard(text, field) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // Fallback
      const el = document.createElement("textarea")
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    }
  }

  return (
    <div className="glass rounded-xl p-5 animate-slide-up">
      <h3 className="font-semibold mb-1 flex items-center gap-2">
        <Hash className="w-4 h-4 text-accent" />
        Share to Social Media
      </h3>
      <p className="text-xs text-text-muted mb-4">
        Download the video and upload to your favorite platform.
      </p>

      {/* Caption Editor */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-text-secondary">Caption</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditCaption(!editCaption)}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {editCaption ? "Done" : "Edit"}
            </button>
            <button
              onClick={() => copyToClipboard(caption, "caption")}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors btn-press"
            >
              {copiedField === "caption" ? (
                <><Check className="w-3 h-3" /> Copied</>
              ) : (
                <><Copy className="w-3 h-3" /> Copy</>
              )}
            </button>
          </div>
        </div>
        {editCaption ? (
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent/50 resize-none"
          />
        ) : (
          <div className="px-3 py-2 bg-input-bg border border-card-border rounded-lg text-xs text-text-secondary whitespace-pre-line max-h-24 overflow-y-auto">
            {caption}
          </div>
        )}
      </div>

      {/* Hashtags quick copy */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-text-secondary">Hashtags Only</label>
          <button
            onClick={() => copyToClipboard(hashtags, "hashtags")}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors btn-press"
          >
            {copiedField === "hashtags" ? (
              <><Check className="w-3 h-3" /> Copied</>
            ) : (
              <><Copy className="w-3 h-3" /> Copy</>
            )}
          </button>
        </div>
        <div className="px-3 py-2 bg-input-bg border border-card-border rounded-lg text-xs text-text-muted">
          {hashtags}
        </div>
      </div>

      {/* Platform buttons */}
      <div className="space-y-2">
        {PLATFORMS.map((platform) => {
          const Icon = platform.icon
          return (
            <div
              key={platform.id}
              className="flex items-center justify-between p-3 bg-input-bg rounded-lg group"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium">{platform.name}</p>
                  <p className="text-[10px] text-text-muted">{platform.specs}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadFilename || "episode.mp4"}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary bg-overlay-strong rounded-lg transition-colors btn-press"
                    title="Download video"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
                <a
                  href={platform.uploadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg font-medium transition-colors btn-press"
                >
                  Upload
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-text-muted mt-3 text-center">
        Copy the caption, download the video, then upload to each platform.
      </p>
    </div>
  )
}
