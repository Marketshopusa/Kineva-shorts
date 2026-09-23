"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { loadSeries, loadCharacters, createCharacter, updateCharacter, deleteCharacter } from "@/lib/storage-api"
import CharacterCard from "@/components/characters/CharacterCard"
import CharacterEditor from "@/components/characters/CharacterEditor"
import Breadcrumb from "@/components/ui/Breadcrumb"

export default function CharactersPage({ params }) {
  const { id } = use(params)
  const seriesId = Number(id)
  const [series, setSeries] = useState(null)
  const [characters, setCharacters] = useState([])
  const [editing, setEditing] = useState(null) // null = none, "new" = new, character object = editing
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [seriesId])

  async function loadData() {
    const [s, chars] = await Promise.all([
      loadSeries(seriesId),
      loadCharacters(seriesId),
    ])
    setSeries(s)
    setCharacters(chars)
    setLoading(false)
  }

  async function handleSave(charData) {
    if (editing === "new") {
      const charId = await createCharacter({ ...charData, seriesId })
      setCharacters((prev) => [...prev, { ...charData, seriesId, id: charId }])
    } else {
      await updateCharacter(editing.id, charData)
      setCharacters((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...charData } : c)))
    }
    setEditing(null)
  }

  async function handleDelete(charId) {
    await deleteCharacter(charId)
    setCharacters((prev) => prev.filter((c) => c.id !== charId))
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-surface rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Breadcrumb items={[
          { label: "Dashboard", href: "/admin" },
          { label: series?.title || "Series", href: `/admin/series/${seriesId}` },
          { label: "Characters" },
        ]} />
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-serif font-bold">Characters</h1>
          {!editing && (
            <button
              onClick={() => setEditing("new")}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              + New Character
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-8">
          <CharacterEditor
            character={editing === "new" ? null : editing}
            allCharacters={characters}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {characters.some((c) => c.pendingMasterApproval) && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-amber-400/30 bg-amber-500/10 text-sm text-amber-200">
          Character master candidate is waiting for approval. Visual Identity stays NOT LOCKED until you confirm.
        </div>
      )}

      {characters.length === 0 && !editing ? (
        <div className="text-center py-12 bg-surface rounded-xl border border-border">
          <p className="text-text-muted mb-3">No characters yet.</p>
          <button
            onClick={() => setEditing("new")}
            className="text-sm text-accent hover:text-accent-hover"
          >
            + Add Your First Character
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onEdit={(c) => setEditing(c)}
              onDelete={handleDelete}
              onReferenceCleared={() =>
                setCharacters((prev) =>
                  prev.map((c) => c.id === char.id ? { ...c, referenceImageUrl: null, referenceEpisode: null } : c)
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
