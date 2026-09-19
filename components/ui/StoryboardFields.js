"use client"

import { getSceneStoryboard, normalizeStoryboard } from "@/lib/storyboard"

function primaryCharacterId(board, characters) {
  if (board.characterIds[0]) return board.characterIds[0]
  return characters?.[0]?.id || null
}

export default function StoryboardFields({ scene, characters = [], onChange }) {
  const board = getSceneStoryboard(scene)
  const charId = primaryCharacterId(board, characters)
  const wardrobe = charId != null ? (board.wardrobe[String(charId)] || "") : ""
  const emotion = charId != null ? (board.emotion[String(charId)] || "") : ""

  function patch(partial) {
    const next = normalizeStoryboard({ ...board, ...partial })
    onChange?.({ storyboard: next })
  }

  function toggleCharacter(id) {
    const has = board.characterIds.includes(id)
    patch({
      characterIds: has
        ? board.characterIds.filter((x) => x !== id)
        : [...board.characterIds, id],
    })
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Storyboard</div>

      {characters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {characters.map((char) => {
            const selected = board.characterIds.includes(char.id)
            return (
              <button
                key={char.id}
                type="button"
                onClick={() => toggleCharacter(char.id)}
                className={`text-[10px] px-2 py-0.5 rounded border ${
                  selected
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-text-muted hover:text-text-primary"
                }`}
              >
                {char.name} #{char.id}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-text-muted col-span-2 sm:col-span-1">
          Location
          <input
            value={board.location || ""}
            onChange={(e) => patch({ location: e.target.value || null })}
            placeholder="elena_apartment"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted col-span-2 sm:col-span-1">
          Shot
          <input
            value={board.shot || ""}
            onChange={(e) => patch({ shot: e.target.value || null })}
            placeholder="close-up"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted col-span-2 sm:col-span-1">
          Camera
          <input
            value={board.cameraMovement || ""}
            onChange={(e) => patch({ cameraMovement: e.target.value || null })}
            placeholder="slow push-in"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted col-span-2 sm:col-span-1">
          Lighting
          <input
            value={board.lighting || ""}
            onChange={(e) => patch({ lighting: e.target.value || null })}
            placeholder="blue nighttime light"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted col-span-2">
          Action
          <input
            value={board.action || ""}
            onChange={(e) => patch({ action: e.target.value || null })}
            placeholder="listens to the message for the second time"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted">
          Wardrobe {charId ? `(#${charId})` : ""}
          <input
            value={wardrobe}
            onChange={(e) => {
              if (!charId) return
              patch({ wardrobe: { ...board.wardrobe, [String(charId)]: e.target.value } })
            }}
            placeholder="black wool coat"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted">
          Emotion {charId ? `(#${charId})` : ""}
          <input
            value={emotion}
            onChange={(e) => {
              if (!charId) return
              patch({ emotion: { ...board.emotion, [String(charId)]: e.target.value } })
            }}
            placeholder="contained fear"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted col-span-2">
          Props
          <input
            value={board.props.map((p) => p.key).join(", ")}
            onChange={(e) => {
              const keys = e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
              patch({
                props: keys.map((key) => {
                  const prev = board.props.find((p) => p.key === key)
                  return prev || { key, description: key, continuity: null }
                }),
              })
            }}
            placeholder="brother_phone"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted col-span-2">
          Continuity
          <input
            value={board.continuity.join(", ")}
            onChange={(e) => patch({
              continuity: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            })}
            placeholder="same_phone_as_scene_2, nighttime"
            className="mt-0.5 w-full px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text-primary"
          />
        </label>
      </div>
      <p className="text-[10px] text-text-muted">
        Camera here is cinematic intent. Remotion Ken Burns still uses zoom_direction.
      </p>
    </div>
  )
}
