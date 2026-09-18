"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import SeriesForm from "@/components/series/SeriesForm"
import { createCharacter } from "@/lib/storage-api"
import { SERIES_TEMPLATES } from "@/config/seriesTemplates"
import { Sparkles, Plus, Trash2, ChevronDown, ChevronUp, Loader2, User, ArrowRight, AlertCircle } from "lucide-react"

// ─── Inline character card ────────────────────────────────────────────────────
const ROLES = ["protagonist", "antagonist", "supporting"]
const ROLE_COLORS = { protagonist: "text-blue-400 bg-blue-400/10", antagonist: "text-red-400 bg-red-400/10", supporting: "text-text-muted bg-surface-2" }

function CharacterCard({ char, index, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(false)

  function set(path, value) {
    const parts = path.split(".")
    const next = JSON.parse(JSON.stringify(char))
    let target = next
    for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]]
    target[parts[parts.length - 1]] = value
    onChange(next)
  }

  function setTrait(i, value) {
    const traits = [...(char.personality?.traits || [])]
    traits[i] = value
    set("personality.traits", traits)
  }

  function addTrait() {
    set("personality.traits", [...(char.personality?.traits || []), ""])
  }

  function removeTrait(i) {
    const traits = [...(char.personality?.traits || [])]
    traits.splice(i, 1)
    set("personality.traits", traits)
  }

  const inputCls = "w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={char.name || ""}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Character name"
            className="w-full bg-transparent text-sm font-semibold text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <select
          value={char.role || "supporting"}
          onChange={(e) => set("role", e.target.value)}
          className={`text-xs px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-1 focus:ring-accent/20 ${ROLE_COLORS[char.role] || ROLE_COLORS.supporting} bg-transparent cursor-pointer`}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={() => setExpanded((v) => !v)} className="text-text-muted hover:text-text-primary transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={onRemove} className="text-text-muted hover:text-accent transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Quick fields (always visible) */}
      <div className="px-4 pb-4 space-y-2 border-t border-card-border pt-3">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Appearance</label>
          <input
            value={char.appearance?.basePrompt || ""}
            onChange={(e) => set("appearance.basePrompt", e.target.value)}
            placeholder="e.g. 30s woman, dark hair, sharp features, olive skin..."
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Traits</label>
          <div className="flex flex-wrap gap-1.5">
            {(char.personality?.traits || []).map((trait, i) => (
              <div key={i} className="flex items-center gap-1 bg-surface-2 rounded-full px-2 py-0.5">
                <input
                  value={trait}
                  onChange={(e) => setTrait(i, e.target.value)}
                  className="bg-transparent text-xs text-text-secondary w-20 focus:outline-none focus:w-28 transition-all"
                />
                <button onClick={() => removeTrait(i)} className="text-text-muted hover:text-accent transition-colors">
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {(char.personality?.traits || []).length < 5 && (
              <button onClick={addTrait} className="text-[10px] text-accent hover:text-accent-hover border border-dashed border-accent/30 rounded-full px-2 py-0.5 transition-colors">
                + trait
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Advanced fields (collapsed by default) */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-card-border pt-3 bg-surface/30">
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Wardrobe</label>
            <input value={char.appearance?.wardrobeDefault || ""} onChange={(e) => set("appearance.wardrobeDefault", e.target.value)} placeholder="Typical outfit..." className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Distinguishing Features</label>
            <input value={char.appearance?.distinguishingFeatures || ""} onChange={(e) => set("appearance.distinguishingFeatures", e.target.value)} placeholder="Scar, tattoo, signature gesture..." className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Speech Pattern</label>
            <input value={char.personality?.speechPattern || ""} onChange={(e) => set("personality.speechPattern", e.target.value)} placeholder="Speaks in short bursts, rarely shows emotion..." className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Backstory</label>
            <textarea value={char.personality?.backstory || ""} onChange={(e) => set("personality.backstory", e.target.value)} placeholder="Character background..." rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export default function NewSeriesPage() {
  const router = useRouter()
  const [step, setStep] = useState(1) // 1 = series details, 2 = characters
  const [seriesId, setSeriesId] = useState(null)
  const [seriesData, setSeriesData] = useState(null)
  const [characters, setCharacters] = useState([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [formKey, setFormKey] = useState(0) // increment to re-mount SeriesForm with new initial values

  function handleSelectTemplate(template) {
    setSelectedTemplate(template)
    setFormKey((k) => k + 1) // re-mount SeriesForm with new initialValues
  }

  function handleSeriesCreated(id, formData) {
    setSeriesId(id)
    setSeriesData(formData)
    setStep(2)
    // If template has characters, use those; otherwise AI-generate
    if (selectedTemplate?.characters?.length > 0) {
      setCharacters(selectedTemplate.characters)
    } else {
      generateCharacters(formData)
    }
  }

  async function generateCharacters(data) {
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch("/api/admin/generate-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          theme: data.theme,
          tone: data.tone,
          setting: data.setting,
          contentRating: data.contentRating,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setCharacters(json.characters)
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function addBlankCharacter() {
    setCharacters((prev) => [
      ...prev,
      {
        name: "",
        role: "supporting",
        appearance: { basePrompt: "", wardrobeDefault: "", distinguishingFeatures: "" },
        personality: { traits: [], speechPattern: "", backstory: "", motivations: [], relationships: {}, arcProgression: [] },
      },
    ])
  }

  function updateCharacter(index, updated) {
    setCharacters((prev) => prev.map((c, i) => (i === index ? updated : c)))
  }

  function removeCharacter(index) {
    setCharacters((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleContinue() {
    if (!seriesId || characters.length === 0) return
    setSaving(true)
    try {
      await Promise.all(
        characters
          .filter((c) => c.name?.trim())
          .map((c) =>
            createCharacter({
              seriesId,
              name: c.name,
              role: c.role || "supporting",
              appearance: c.appearance || {},
              personality: c.personality || {},
            })
          )
      )
      // Go straight to first episode creation
      router.push(`/admin/series/${seriesId}/episode/new`)
    } catch (err) {
      console.error("Failed to save characters:", err)
      setSaving(false)
    }
  }

  async function handleSkipToSeries() {
    // Save characters if any, then go to series page
    if (characters.filter((c) => c.name?.trim()).length > 0) {
      setSaving(true)
      try {
        await Promise.all(
          characters
            .filter((c) => c.name?.trim())
            .map((c) =>
              createCharacter({
                seriesId,
                name: c.name,
                role: c.role || "supporting",
                appearance: c.appearance || {},
                personality: c.personality || {},
              })
            )
        )
      } catch (err) {
        console.error("Failed to save characters:", err)
      }
    }
    router.push(`/admin/series/${seriesId}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-text-muted hover:text-text-primary transition-colors">
          &larr; Back to Dashboard
        </Link>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-4 mb-1">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 1 ? "text-accent" : "text-green-400"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 1 ? "bg-accent text-white" : "bg-green-400/20 text-green-400"}`}>
              {step === 1 ? "1" : "✓"}
            </div>
            Series Details
          </div>
          <div className="h-px w-8 bg-card-border" />
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 2 ? "text-accent" : "text-text-muted"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 2 ? "bg-accent text-white" : "bg-surface-2 text-text-muted"}`}>
              2
            </div>
            Characters
          </div>
        </div>

        <h1 className="text-2xl font-bold mt-3">
          {step === 1 ? "Create New Series" : `Characters for "${seriesData?.title}"`}
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          {step === 1
            ? "Set up your drama series with theme, languages, and premise."
            : "AI has generated characters — edit, add, or remove before creating your first episode."}
        </p>
      </div>

      {step === 1 && (
        <>
          {/* Template picker */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Start from a template</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SERIES_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    selectedTemplate?.id === t.id
                      ? "border-accent bg-accent/10"
                      : "border-card-border bg-surface hover:border-accent/40"
                  }`}
                >
                  <div className="text-xl mb-1">{t.emoji}</div>
                  <div className="text-xs font-semibold text-text-primary">{t.name}</div>
                  <div className="text-[10px] text-text-muted mt-0.5 leading-snug">{t.description}</div>
                </button>
              ))}
            </div>
            {selectedTemplate && (
              <p className="text-xs text-text-muted mt-2">
                Template applied — form is pre-filled. You can edit any field before creating.
                <button onClick={() => { setSelectedTemplate(null); setFormKey((k) => k + 1) }} className="ml-2 text-accent hover:text-accent-hover underline">
                  Clear template
                </button>
              </p>
            )}
          </div>

          <div className="border-t border-card-border pt-6">
            <SeriesForm
              key={formKey}
              onCreated={handleSeriesCreated}
              initialValues={selectedTemplate?.form || undefined}
            />
          </div>
        </>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {/* Generating state */}
          {generating && (
            <div className="flex items-center gap-3 p-4 glass rounded-xl text-sm text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
              Generating characters with AI...
            </div>
          )}

          {/* Error state */}
          {genError && !generating && (
            <div className="flex items-start gap-3 p-4 bg-accent/5 border border-accent/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="text-accent font-medium">Character generation failed</p>
                <p className="text-text-muted mt-0.5">{genError}</p>
              </div>
              <button
                onClick={() => generateCharacters(seriesData)}
                className="text-xs text-accent hover:text-accent-hover border border-accent/30 px-2.5 py-1 rounded-lg transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Character cards */}
          {!generating && characters.map((char, i) => (
            <CharacterCard
              key={i}
              char={char}
              index={i}
              onChange={(updated) => updateCharacter(i, updated)}
              onRemove={() => removeCharacter(i)}
            />
          ))}

          {/* Action buttons */}
          {!generating && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={addBlankCharacter}
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary border border-dashed border-card-border hover:border-accent/30 px-3 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add manually
              </button>
              <button
                onClick={() => generateCharacters(seriesData)}
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-accent border border-dashed border-card-border hover:border-accent/30 px-3 py-2 rounded-lg transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Regenerate
              </button>
            </div>
          )}

          {/* CTA */}
          <div className="flex items-center gap-3 pt-4 border-t border-card-border">
            <button
              onClick={handleContinue}
              disabled={saving || generating || characters.filter((c) => c.name?.trim()).length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors btn-press"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                <><ArrowRight className="w-4 h-4" /> Create First Episode</>
              )}
            </button>
            <button
              onClick={handleSkipToSeries}
              disabled={saving}
              className="text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Go to series page instead →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
