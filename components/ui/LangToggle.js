"use client"

import { LANGUAGES } from "@/config/languages"

export default function LangToggle({ selected = [], onChange }) {
  function toggle(code) {
    if (selected.includes(code)) {
      if (selected.length <= 1) return
      onChange(selected.filter((c) => c !== code))
    } else {
      onChange([...selected, code])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGES.map((lang) => {
        const active = selected.includes(lang.code)
        return (
          <button
            key={lang.code}
            onClick={() => toggle(lang.code)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              active
                ? "bg-accent/20 border-accent text-accent"
                : "bg-surface-2 border-border text-text-muted hover:border-text-muted"
            }`}
          >
            {lang.flag} {lang.code.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
