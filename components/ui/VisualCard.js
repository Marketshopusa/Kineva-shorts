"use client"

import { useState } from "react"
import { Lock, CheckCircle2 } from "lucide-react"
import {
  characterReferenceDisplaySrc,
  resolveCharactersForScene,
  visualIdentityStatus,
} from "@/lib/character-identity"

export default function VisualCard({ scene, sceneIndex, image, status, onGenerate, onApprove, characters, episodeNumber, onReferenceChange }) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [identityOverride, setIdentityOverride] = useState({})

  const sceneCharacters = resolveCharactersForScene(scene, characters)

  async function handleSetReference(char) {
    if (!image?.url) return
    try {
      const res = await fetch(`/api/admin/characters/${char.id}/reference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: image.url, episodeNumber: episodeNumber || null }),
      })
      if (res.ok) {
        const data = await res.json()
        setIdentityOverride((prev) => ({
          ...prev,
          [char.id]: { referenceImageUrl: data.referenceImageUrl, visualIdentity: data.visualIdentity },
        }))
        onReferenceChange?.(char.id, data)
      }
    } catch {
      // non-critical
    }
  }

  function identityFor(char) {
    return identityOverride[char.id] || {
      referenceImageUrl: char.referenceImageUrl,
      visualIdentity: visualIdentityStatus(char),
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="aspect-[9/16] bg-surface-2 relative">
        {status === "generating" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-xs text-text-muted">Generating...</span>
            </div>
          </div>
        )}

        {status === "done" && image?.url && (
          <img
            src={image.url}
            alt={`Scene ${sceneIndex + 1}`}
            className="w-full h-full object-cover"
          />
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center px-4">
              <span className="text-accent text-2xl">!</span>
              <p className="text-xs text-text-muted mt-1">Generation failed. Try regenerating.</p>
            </div>
          </div>
        )}

        {(!status || status === "idle") && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-text-muted">Not generated</span>
          </div>
        )}

        {image?.approved && (
          <div className="absolute top-2 right-2 bg-green-500/90 text-white text-xs px-2 py-0.5 rounded">
            Approved
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-muted">
            #{sceneIndex + 1} {scene.type?.replace("_", " ")}
          </span>
          <span className="text-xs text-text-muted">{scene.duration_sec}s</span>
        </div>

        {sceneCharacters.length > 0 && (
          <div className="mb-2 space-y-1">
            {sceneCharacters.map((char) => {
              const identity = identityFor(char)
              const locked = identity.visualIdentity === "LOCKED" || !!identity.referenceImageUrl
              const thumb = characterReferenceDisplaySrc({ ...char, referenceImageUrl: identity.referenceImageUrl })
              return (
                <div key={char.id} className="flex items-center gap-2">
                  {locked && thumb ? (
                    <img src={thumb} alt="" className="w-6 h-8 rounded object-cover border border-green-500/40" />
                  ) : (
                    <div className="w-6 h-8 rounded bg-surface-2 border border-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-text-primary truncate">{char.name}</div>
                    <div className={`text-[10px] font-semibold ${locked ? "text-green-400" : "text-text-muted"}`}>
                      Visual Identity {locked ? "LOCKED" : "NOT LOCKED"}
                    </div>
                  </div>
                  {image?.url && (
                    <button
                      type="button"
                      onClick={() => handleSetReference(char)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                    >
                      {locked ? <><CheckCircle2 className="w-2.5 h-2.5" /> Replace Reference</> : <><Lock className="w-2.5 h-2.5" /> Set as Character Reference</>}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onGenerate(scene, sceneIndex)}
            disabled={status === "generating"}
            className="flex-1 px-3 py-1.5 text-xs bg-surface-2 border border-border rounded-lg text-text-muted hover:text-text-primary hover:border-text-muted transition-colors disabled:opacity-50"
          >
            {status === "done" ? "Regenerate" : "Generate"}
          </button>

          {status === "done" && (
            <button
              onClick={() => onApprove(sceneIndex)}
              className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                image?.approved
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30"
              }`}
            >
              {image?.approved ? "Approved" : "Approve"}
            </button>
          )}
        </div>

        {image?.prompt && (
          <div className="mt-2">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              {showPrompt ? "Hide prompt" : "Show prompt"}
            </button>
            {showPrompt && (
              <p className="text-xs text-text-muted mt-1 p-2 bg-surface-2 rounded whitespace-pre-wrap">{image.prompt}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
