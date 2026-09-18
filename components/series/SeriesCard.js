"use client"

import { useState } from "react"
import Link from "next/link"
import { getThemeById } from "@/config/themes"
import { getLanguageByCode } from "@/config/languages"
import { Trash2 } from "lucide-react"
import ConfirmDialog from "@/components/ui/ConfirmDialog"

export default function SeriesCard({ series, onDelete }) {
  const theme = getThemeById(series.theme)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Link
        href={`/admin/series/${series.id}`}
        className="block glass rounded-xl p-5 hover:border-accent/20 transition-all duration-200 group card-hover"
      >
        <div className="flex items-start justify-between mb-3">
          <span className="text-2xl">{theme?.icon || "🎬"}</span>
          <span className="text-xs text-text-muted bg-input-bg px-2 py-1 rounded-lg">
            {series.episodeCount || 0} ep{(series.episodeCount || 0) !== 1 ? "s" : ""}
          </span>
        </div>

        <h3 className="text-lg font-semibold mb-1 group-hover:text-accent transition-colors">
          {series.title}
        </h3>

        <p className="text-sm text-text-muted mb-3 line-clamp-2">
          {series.premise || theme?.description}
        </p>

        <div className="flex items-center gap-1.5 flex-wrap">
          {series.languages?.map((code) => {
            const lang = getLanguageByCode(code)
            return (
              <span key={code} className="text-xs bg-input-bg px-2 py-0.5 rounded-md text-text-secondary">
                {lang?.flag} {code.toUpperCase()}
              </span>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-card-border">
          <span className="text-xs text-text-muted">{theme?.name}</span>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setConfirmOpen(true)
            }}
            className="text-text-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 btn-press"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </Link>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Series?"
        message={`"${series.title}" and all its episodes, images, and data will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete Series"
        onConfirm={() => {
          setConfirmOpen(false)
          onDelete(series.id)
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
