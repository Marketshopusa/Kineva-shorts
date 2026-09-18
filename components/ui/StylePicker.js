"use client"

import { VISUAL_STYLES } from "@/config/visualStyles"

export default function StylePicker({ value, onChange, compact = false }) {
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
      {VISUAL_STYLES.map((style) => {
        const isSelected = value === style.key
        return (
          <button
            key={style.key}
            type="button"
            onClick={() => onChange(style.key)}
            className={`relative text-left rounded-xl border transition-all overflow-hidden ${
              isSelected
                ? "border-accent ring-1 ring-accent"
                : "border-border hover:border-text-muted"
            } ${compact ? "p-2" : "p-3"}`}
          >
            {/* Gradient background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${style.bgClass} opacity-60`} />

            {/* Selected checkmark */}
            {isSelected && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center z-10">
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}

            <div className="relative z-10">
              <div className={`${compact ? "text-lg" : "text-2xl"} mb-1`}>{style.emoji}</div>
              <div className={`font-semibold text-text-primary ${compact ? "text-[10px]" : "text-xs"}`}>
                {style.name}
              </div>
              {!compact && (
                <div className="text-[10px] text-text-muted mt-0.5 leading-tight">
                  {style.description}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
