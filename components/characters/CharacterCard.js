"use client"

import { Lock } from "lucide-react"
import { characterReferenceDisplaySrc, visualIdentityStatus } from "@/lib/character-identity"
import { characterMasterImageSrc } from "@/lib/character-master.js"

const ROLE_COLORS = {
  protagonist: "text-green-400",
  antagonist: "text-red-400",
  supporting: "text-blue-400",
  minor: "text-text-muted",
}

function CanonicalPortrait({ character, compact }) {
  const src = characterReferenceDisplaySrc(character)
  if (!src) return null
  if (compact) {
    return (
      <div className="relative shrink-0">
        <div className="w-10 h-[71px] rounded-lg overflow-hidden border border-green-500/40">
          <img
            src={src}
            alt={`${character.name} canonical reference`}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    )
  }
  return (
    <div className="relative shrink-0">
      <div className="w-28 h-[199px] rounded-xl overflow-hidden border border-green-500/40 bg-surface-2">
        <img
          src={src}
          alt={`${character.name} canonical character reference`}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-green-500/90 text-[10px] font-semibold text-white">
        LOCKED
      </div>
    </div>
  )
}

function CandidatePortrait({ character, compact }) {
  const src = character.masterCandidateImageSrc || characterMasterImageSrc(character.id)
  if (compact) {
    return (
      <div className="relative shrink-0">
        <div className="w-10 h-[71px] rounded-lg overflow-hidden border border-amber-400/40">
          <img
            src={src}
            alt={`${character.name} master candidate`}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    )
  }
  return (
    <div className="relative shrink-0">
      <div className="w-28 h-[199px] rounded-xl overflow-hidden border border-amber-400/40 bg-surface-2">
        <img
          src={src}
          alt={`${character.name} character master candidate`}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-amber-500/90 text-[10px] font-semibold text-black">
        PENDING APPROVAL
      </div>
    </div>
  )
}

export default function CharacterCard({ character, compact = false, onEdit, onDelete, onReferenceCleared, onReplaceReference }) {
  const roleColor = ROLE_COLORS[character.role] || "text-text-muted"
  const locked = visualIdentityStatus(character) === "LOCKED"
  const pendingCandidate = !locked && !!character.pendingMasterApproval

  if (compact) {
    return (
      <div className="p-3 bg-surface border border-border rounded-xl">
        <div className="flex items-start gap-3">
          {locked && <CanonicalPortrait character={character} compact />}
          {pendingCandidate && <CandidatePortrait character={character} compact />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-sm truncate">{character.name}</div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] font-semibold ${locked ? "text-green-400" : "text-text-muted"}`}>
                  {locked ? "LOCKED" : "NOT LOCKED"}
                </span>
                <span className={`text-xs ${roleColor} capitalize`}>{character.role}</span>
              </div>
            </div>
            {pendingCandidate && (
              <div className="text-[10px] font-semibold text-amber-400 mt-1">PENDING APPROVAL</div>
            )}
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
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 bg-surface border border-border rounded-xl">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          {locked && <CanonicalPortrait character={character} compact={false} />}
          {pendingCandidate && <CandidatePortrait character={character} compact={false} />}
          <div>
            <h3 className="font-semibold text-lg">{character.name}</h3>
            <span className={`text-sm ${roleColor} capitalize`}>{character.role}</span>
            <div className={`text-[10px] flex items-center gap-1 mt-0.5 font-semibold ${locked ? "text-green-400" : "text-text-muted"}`}>
              {locked && <Lock className="w-2.5 h-2.5" />}
              Visual Identity {locked ? "LOCKED" : "NOT LOCKED"}
              {locked && character.referenceEpisode ? ` (ep. ${character.referenceEpisode})` : ""}
            </div>
            {pendingCandidate && (
              <div className="text-[10px] font-semibold text-amber-400 mt-1">
                CHARACTER MASTER · candidate only · not canonical
              </div>
            )}
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
