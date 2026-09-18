"use client"

import { useState } from "react"

const ROLES = ["protagonist", "antagonist", "supporting", "minor"]

const DEFAULT_CHARACTER = {
  name: "",
  role: "supporting",
  personality: {
    traits: [],
    speechPattern: "",
    backstory: "",
    motivations: [],
    relationships: {},
    arcProgression: [],
  },
  appearance: {
    basePrompt: "",
    wardrobeDefault: "",
    distinguishingFeatures: "",
  },
}

export default function CharacterEditor({ character, allCharacters = [], onSave, onCancel }) {
  const isNew = !character
  const [form, setForm] = useState(character || DEFAULT_CHARACTER)
  const [activeTab, setActiveTab] = useState("personality")
  const [traitInput, setTraitInput] = useState("")
  const [motivationInput, setMotivationInput] = useState("")
  const [relName, setRelName] = useState("")
  const [relDesc, setRelDesc] = useState("")

  function updateField(path, value) {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      const parts = path.split(".")
      let target = next
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]]
      }
      target[parts[parts.length - 1]] = value
      return next
    })
  }

  function addTrait() {
    if (!traitInput.trim()) return
    updateField("personality.traits", [...(form.personality.traits || []), traitInput.trim()])
    setTraitInput("")
  }

  function removeTrait(trait) {
    updateField("personality.traits", form.personality.traits.filter((t) => t !== trait))
  }

  function addMotivation() {
    if (!motivationInput.trim()) return
    updateField("personality.motivations", [...(form.personality.motivations || []), motivationInput.trim()])
    setMotivationInput("")
  }

  function removeMotivation(m) {
    updateField("personality.motivations", form.personality.motivations.filter((x) => x !== m))
  }

  function addRelationship() {
    if (!relName.trim() || !relDesc.trim()) return
    updateField("personality.relationships", {
      ...form.personality.relationships,
      [relName.trim()]: relDesc.trim(),
    })
    setRelName("")
    setRelDesc("")
  }

  function removeRelationship(name) {
    const rels = { ...form.personality.relationships }
    delete rels[name]
    updateField("personality.relationships", rels)
  }

  function handleSave() {
    if (!form.name.trim()) return
    onSave(form)
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">{isNew ? "New Character" : `Edit: ${form.name}`}</h3>

      {/* Name + Role */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Sarah Chen"
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-border">
        {["personality", "appearance"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "personality" && (
        <div className="space-y-4">
          {/* Traits */}
          <div>
            <label className="block text-sm font-medium mb-1">Traits</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={traitInput}
                onChange={(e) => setTraitInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTrait())}
                placeholder="determined"
                className="flex-1 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button onClick={addTrait} className="px-3 py-1.5 bg-accent/20 text-accent rounded-lg text-sm">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {form.personality.traits?.map((trait) => (
                <span
                  key={trait}
                  className="text-xs bg-surface-2 px-2 py-1 rounded flex items-center gap-1 text-text-muted"
                >
                  {trait}
                  <button onClick={() => removeTrait(trait)} className="text-text-muted hover:text-accent ml-1">
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Speech Pattern */}
          <div>
            <label className="block text-sm font-medium mb-1">Speech Pattern</label>
            <input
              type="text"
              value={form.personality.speechPattern}
              onChange={(e) => updateField("personality.speechPattern", e.target.value)}
              placeholder="Direct, short sentences when stressed"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          {/* Backstory */}
          <div>
            <label className="block text-sm font-medium mb-1">Backstory</label>
            <textarea
              value={form.personality.backstory}
              onChange={(e) => updateField("personality.backstory", e.target.value)}
              placeholder="MIT grad, first-gen Chinese-American, joined the firm to make her immigrant parents proud."
              rows={2}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Motivations */}
          <div>
            <label className="block text-sm font-medium mb-1">Motivations</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={motivationInput}
                onChange={(e) => setMotivationInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMotivation())}
                placeholder="uncover truth"
                className="flex-1 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button onClick={addMotivation} className="px-3 py-1.5 bg-accent/20 text-accent rounded-lg text-sm">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {form.personality.motivations?.map((m) => (
                <span
                  key={m}
                  className="text-xs bg-surface-2 px-2 py-1 rounded flex items-center gap-1 text-text-muted"
                >
                  {m}
                  <button onClick={() => removeMotivation(m)} className="text-text-muted hover:text-accent ml-1">
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Relationships */}
          <div>
            <label className="block text-sm font-medium mb-1">Relationships</label>
            <div className="flex gap-2 mb-2">
              <select
                value={relName}
                onChange={(e) => setRelName(e.target.value)}
                className="w-1/3 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">Select character</option>
                {allCharacters
                  .filter((c) => c.name !== form.name && !form.personality.relationships?.[c.name])
                  .map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
              </select>
              <input
                type="text"
                value={relDesc}
                onChange={(e) => setRelDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRelationship())}
                placeholder="mentor, increasingly suspicious"
                className="flex-1 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button onClick={addRelationship} className="px-3 py-1.5 bg-accent/20 text-accent rounded-lg text-sm">
                Add
              </button>
            </div>
            {Object.entries(form.personality.relationships || {}).map(([name, desc]) => (
              <div key={name} className="flex items-center justify-between text-sm bg-surface-2 px-3 py-1.5 rounded-lg mb-1">
                <span>
                  <span className="font-medium">{name}</span>
                  <span className="text-text-muted"> &mdash; {desc}</span>
                </span>
                <button onClick={() => removeRelationship(name)} className="text-text-muted hover:text-accent">
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "appearance" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Base Appearance Prompt</label>
            <textarea
              value={form.appearance.basePrompt}
              onChange={(e) => updateField("appearance.basePrompt", e.target.value)}
              placeholder="East Asian woman, late 20s, sharp jawline, shoulder-length straight black hair with subtle auburn highlights, dark brown eyes, slim athletic build, 5'6&quot;"
              rows={3}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
            <p className="text-xs text-text-muted mt-1">
              This exact text is injected into every image prompt. Be specific and consistent.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Default Wardrobe</label>
            <input
              type="text"
              value={form.appearance.wardrobeDefault}
              onChange={(e) => updateField("appearance.wardrobeDefault", e.target.value)}
              placeholder="tailored navy blazer over white silk blouse, slim-cut black trousers"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Distinguishing Features</label>
            <input
              type="text"
              value={form.appearance.distinguishingFeatures}
              onChange={(e) => updateField("appearance.distinguishingFeatures", e.target.value)}
              placeholder="small scar on left eyebrow, leather messenger bag"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-6 pt-4 border-t border-border">
        <button
          onClick={handleSave}
          disabled={!form.name.trim()}
          className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isNew ? "Add Character" : "Save Changes"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-5 py-2 border border-border text-text-muted hover:text-text-primary rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
