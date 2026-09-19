"use client"

import { Lock, X } from "lucide-react"
import { characterReferenceDisplaySrc, visualIdentityStatus } from "@/lib/character-identity"

const ROLE_COLORS = {
  protagonist: "text-green-400",
  antagonist: "text-red-400",
  supporting: "text-blue-400",
  minor: "text-text-muted",
}

async function clearReference(charId, onClear) {
  try {
    const res = await fetch(`/api/admin/characters/${charId}/reference`, { method: "DELETE" })
    if (res.ok) onClear?.()
  } catch {
    // silent fail
  }
}

export default function CharacterCard({ character, compact = false, onEdit, onDelete, onReferenceCleared, onReplaceReference }) {
  const roleColor = ROLE_COLORS[character.role] || "text-text-muted"
  const locked = visualIdentityStatus(character) === "LOCKED"
  const thumb = characterReferenceDisplaySrc(character)

  if (compact) {
    return (
      <div className="p-3 bg-surface border border-border rounded-xl">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{character.name}</div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold ${locked ? "text-green-400" : "text-text-muted"}`}>
              {locked ? "LOCKED" : "NOT LOCKED"}
            </span>
            <span className={`text-xs ${roleColor} capitalize`}>{character.role}</span>
          </div>
        </div>
        {character.personality?.traits?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {character.personality.traits.slice(0, 3).map((trait) => (
              <span key={trait} className="text-xs bg-surface-2 px-2 py-0.5 rounded text-text-muted">
                {trait}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-5 bg-surface border border-border rounded-xl">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          {/* Reference image thumbnail */}
          {locked && thumb && (
            <div className="relative shrink-0 group">
              <div className="w-12 h-[85px] rounded-lg overflow-hidden border border-green-500/30">
                <img
                  src={thumb}
                  alt={`${character.name} reference`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -top-1 -left-1 bg-green-500 rounded-full p-0.5">
                <Lock className="w-2.5 h-2.5 text-white" />
              </div>
              {onReferenceCleared && (
                <button
                  onClick={() => clearReference(character.id, onReferenceCleared)}
                  title="Clear reference image"
                  className="absolute -top-1 -right-1 bg-accent rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              )}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-lg">{character.name}</h3>
            <span className={`text-sm ${roleColor} capitalize`}>{character.role}</span>
            <div className={`text-[10px] flex items-center gap-1 mt-0.5 font-semibold ${locked ? "text-green-400" : "text-text-muted"}`}>
              {locked && <Lock className="w-2.5 h-2.5" />}
              Visual Identity {locked ? "LOCKED" : "NOT LOCKED"}
              {locked && character.referenceEpisode ? ` (ep. ${character.referenceEpisode})` : ""}
            </div>
            {onReplaceReference && (
              <button
                type="button"
                onClick={() => onReplaceReference(character)}
                className="text-[10px] text-accent hover:text-accent-hover mt-1"
              >
                {locked ? "Replace Reference" : "Set as Character Reference"}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {onEdit && (
            <button onClick={() => onEdit(character)} className="text-sm text-accent hover:text-accent-hover">
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                if (confirm(`Delete ${character.name}?`)) onDelete(character.id)
              }}
              className="text-sm text-text-muted hover:text-accent"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {character.personality?.backstory && (
        <p className="text-sm text-text-muted mb-3">{character.personality.backstory}</p>
      )}

      {character.personality?.traits?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {character.personality.traits.map((trait) => (
            <span key={trait} className="text-xs bg-surface-2 px-2 py-0.5 rounded text-text-muted">
              {trait}
            </span>
          ))}
        </div>
      )}

      {character.appearance?.basePrompt && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs text-text-muted font-medium mb-1">VISUAL APPEARANCE</div>
          <p className="text-xs text-text-muted">{character.appearance.basePrompt}</p>
        </div>
      )}
    </div>
  )
}
