"use client"

import { useState } from "react"
import SubtitleEditor from "@/components/ui/SubtitleEditor"
import StoryboardFields from "@/components/ui/StoryboardFields"

const TYPE_COLORS = {
  HOOK: "bg-red-500/20 text-red-400",
  SETUP: "bg-blue-500/20 text-blue-400",
  CLUE: "bg-yellow-500/20 text-yellow-400",
  BREAKING_POINT: "bg-purple-500/20 text-purple-400",
  CONFRONTATION: "bg-orange-500/20 text-orange-400",
  CLIFFHANGER: "bg-pink-500/20 text-pink-400",
}

export default function SceneCard({ scene, index, languages, onUpdate, characters = [] }) {
  const [activeLang, setActiveLang] = useState(languages[0] || "en")
  const [showSubtitles, setShowSubtitles] = useState(false)

  const textKey = `text_${activeLang}`
  const typeColor = TYPE_COLORS[scene.type] || "bg-surface-2 text-text-muted"

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-muted">#{scene.scene || index + 1}</span>
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
            onChange={(e) => onUpdate(index, { duration_sec: Number(e.target.value) })}
            className="w-12 px-1 py-0.5 bg-surface-2 border border-border rounded text-xs text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span>s</span>
          <span>&middot;</span>
          <span>{scene.tempo}</span>
          <span>&middot;</span>
          <span>zoom {scene.zoom_direction}</span>
        </div>
      </div>

      {/* Language Tabs */}
      <div className="flex gap-1 mb-2">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveLang(lang)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              activeLang === lang
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Editable Narration */}
      <textarea
        value={scene[textKey] || ""}
        onChange={(e) => onUpdate(index, { [textKey]: e.target.value })}
        dir={activeLang === "ar" ? "rtl" : "ltr"}
        rows={3}
        className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
      />

      {/* Visual Description */}
      <div className="mt-2">
        <label className="text-xs text-text-muted font-medium">Visual</label>
        <textarea
          value={scene.visual_description || ""}
          onChange={(e) => onUpdate(index, { visual_description: e.target.value })}
          rows={2}
          className="w-full mt-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-xs text-text-muted focus:outline-none focus:border-accent resize-none"
        />
      </div>

      {/* Characters in scene */}
      {scene.characters?.length > 0 && (
        <div className="flex gap-1 mt-2">
          {scene.characters.map((name) => (
            <span key={name} className="text-xs bg-surface-2 px-2 py-0.5 rounded text-text-muted">
              {name}
            </span>
          ))}
        </div>
      )}

      <StoryboardFields
        scene={scene}
        characters={characters}
        onChange={(updates) => onUpdate(index, updates)}
      />

      {/* Subtitle toggle */}
      <button
        onClick={() => setShowSubtitles(!showSubtitles)}
        className="mt-2 flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${showSubtitles ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Subtitles {scene.subtitles ? `(${Object.keys(scene.subtitles).length} lang)` : "(auto)"}
      </button>

      {showSubtitles && (
        <SubtitleEditor
          scene={scene}
          languages={languages}
          onUpdate={(updates) => onUpdate(index, updates)}
        />
      )}
    </div>
  )
}
