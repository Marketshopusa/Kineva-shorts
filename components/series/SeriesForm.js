"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { THEMES } from "@/config/themes"
import LangToggle from "@/components/ui/LangToggle"
import StylePicker from "@/components/ui/StylePicker"
import { createSeries } from "@/lib/storage-api"

export default function SeriesForm({ onCreated, initialValues }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: "",
    theme: "",
    tone: "",
    setting: "",
    premise: "",
    languages: ["en", "tr"],
    globalStylePrompt: "",
    visualStyle: "cinematic",
    contentRating: "sfw",
    ...initialValues,
  })

  function update(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "theme") {
        const theme = THEMES.find((t) => t.id === value)
        if (theme) {
          next.tone = next.tone || theme.defaultTone
          next.setting = next.setting || theme.defaultSetting
        }
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title || !form.theme || form.languages.length === 0) return

    setSaving(true)
    try {
      const id = await createSeries(form)
      if (onCreated) {
        onCreated(id, form)
      } else {
        router.push(`/admin/series/${id}`)
      }
    } catch (err) {
      console.error("Failed to create series:", err)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium mb-2">Series Title</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="The Last Broker"
          className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          required
        />
      </div>

      {/* Content rating: SFW vs NSFW rails */}
      <div>
        <label className="block text-sm font-medium mb-3">Audiencia</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: "sfw", name: "SFW", description: "General. Sin sexo explícito." },
            { id: "mature", name: "Maduro +18", description: "TV-MA: violencia, infidelidad, implícito." },
            { id: "explicit", name: "Explícito +18", description: "Adultos consensuados. Age-gate." },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => update("contentRating", opt.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                form.contentRating === opt.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-text-muted"
              }`}
            >
              <div className="font-medium text-sm">{opt.name}</div>
              <div className="text-xs text-text-muted mt-1">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <label className="block text-sm font-medium mb-3">Theme</label>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => update("theme", theme.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                form.theme === theme.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-text-muted"
              }`}
            >
              <div className="text-2xl mb-2">{theme.icon}</div>
              <div className="font-medium text-sm">{theme.name}</div>
              <div className="text-xs text-text-muted mt-1">{theme.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Languages */}
      <div>
        <label className="block text-sm font-medium mb-3">Languages (min 1)</label>
        <LangToggle selected={form.languages} onChange={(langs) => update("languages", langs)} />
      </div>

      {/* Tone */}
      <div>
        <label className="block text-sm font-medium mb-2">Tone</label>
        <input
          type="text"
          value={form.tone}
          onChange={(e) => update("tone", e.target.value)}
          placeholder="dark, suspenseful"
          className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>

      {/* Setting */}
      <div>
        <label className="block text-sm font-medium mb-2">Setting</label>
        <input
          type="text"
          value={form.setting}
          onChange={(e) => update("setting", e.target.value)}
          placeholder="Wall Street, 2024"
          className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>

      {/* Premise */}
      <div>
        <label className="block text-sm font-medium mb-2">Series Premise</label>
        <textarea
          value={form.premise}
          onChange={(e) => update("premise", e.target.value)}
          placeholder="A junior analyst discovers her firm is laundering money and must decide between loyalty and justice."
          rows={3}
          className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
        />
      </div>

      {/* Visual Style */}
      <div>
        <label className="block text-sm font-medium mb-3">Visual Style</label>
        <StylePicker value={form.visualStyle} onChange={(v) => update("visualStyle", v)} />
        <p className="text-xs text-text-muted mt-2">
          Applied to every generated image — defines the look and feel of the entire series.
        </p>
      </div>

      {/* Global Style Prompt (advanced override) */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Style Override <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <textarea
          value={form.globalStylePrompt}
          onChange={(e) => update("globalStylePrompt", e.target.value)}
          placeholder="e.g. rain-slicked streets, neon reflections, muted teal-orange palette"
          rows={2}
          className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
        />
        <p className="text-xs text-text-muted mt-1">
          Extra prompt words appended to every image — use for series-specific color palettes or locations.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!form.title || !form.theme || form.languages.length === 0 || saving}
        className="px-6 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
      >
        {saving ? "Creating..." : "Create Series"}
      </button>
    </form>
  )
}
