"use client"

import { useState } from "react"
import { Lock, CheckCircle2 } from "lucide-react"

export default function VisualCard({ scene, sceneIndex, image, status, onGenerate, onApprove, characters, episodeNumber }) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [lockedChars, setLockedChars] = useState({}) // charId → true

  // Find full character objects for characters in this scene
  const sceneCharacters = scene.characters?.length > 0 && Array.isArray(characters)
    ? characters.filter((c) => scene.characters.includes(c.name))
    : []

  // Characters who already have a reference set (pre-existing)
  function isAlreadyLocked(char) {
    return char.referenceImageUrl && !lockedChars[char.id]
  }

  async function handleLockReference(char) {
    if (!image?.url) return
    try {
      const res = await fetch(`/api/admin/characters/${char.id}/reference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: image.url, episodeNumber: episodeNumber || null }),
      })
      if (res.ok) {
        setLockedChars((prev) => ({ ...prev, [char.id]: true }))
      }
    } catch {
      // silent fail — non-critical
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Image Area */}
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

        {/* Approved badge */}
        {image?.approved && (
          <div className="absolute top-2 right-2 bg-green-500/90 text-white text-xs px-2 py-0.5 rounded">
            Approved
          </div>
        )}

        {/* Character reference lock chips — shown on approved images */}
        {status === "done" && image?.url && sceneCharacters.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            {sceneCharacters.map((char) => {
              const justLocked = lockedChars[char.id]
              const alreadyHasRef = char.referenceImageUrl && !justLocked
              if (alreadyHasRef) return null // don't show chip if already locked from before
              return (
                <button
                  key={char.id}
                  onClick={() => handleLockReference(char)}
                  disabled={justLocked}
                  title={justLocked ? `${char.name}'s reference is locked` : `Set this image as ${char.name}'s visual reference`}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    justLocked
                      ? "bg-green-500/80 text-white cursor-default"
                      : "bg-black/60 text-white/90 hover:bg-black/80 backdrop-blur-sm"
                  }`}
                >
                  {justLocked ? (
                    <><CheckCircle2 className="w-2.5 h-2.5" /> {char.name} locked</>
                  ) : (
                    <><Lock className="w-2.5 h-2.5" /> {char.name}</>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-muted">
            #{sceneIndex + 1} {scene.type?.replace("_", " ")}
          </span>
          <span className="text-xs text-text-muted">{scene.duration_sec}s</span>
        </div>

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
              <p className="text-xs text-text-muted mt-1 p-2 bg-surface-2 rounded">{image.prompt}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
