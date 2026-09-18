import { useCurrentFrame, interpolate } from "remotion"
import { splitIntoChunks, getActiveChunkByFrame } from "../lib/subtitleUtils"

export default function Subtitle({ text, durationSec, fps = 30, isRtl = false, customChunks = null, subtitleEnabled = true, subtitleSize = 62 }) {
  const frame = useCurrentFrame()

  // Use custom chunks if provided, otherwise auto-generate
  let chunks
  if (customChunks && customChunks.length > 0) {
    // Add frame data to custom chunks (they only have startSec/endSec)
    chunks = customChunks.map((c) => ({
      ...c,
      startFrame: Math.round(c.startSec * fps),
      endFrame: Math.round(c.endSec * fps),
    }))
  } else {
    chunks = splitIntoChunks(text, durationSec, fps)
  }

  const active = getActiveChunkByFrame(chunks, frame)

  if (!active || !subtitleEnabled) return null

  // Fade in before startFrame so subtitle is fully visible at startFrame
  const fadeIn = interpolate(frame, [active.startFrame - 4, active.startFrame + 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const fadeOut = interpolate(frame, [active.endFrame - 4, active.endFrame + 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const opacity = Math.min(fadeIn, fadeOut)

  return (
    <div
      style={{
        position: "absolute",
        bottom: "20%",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 56px",
        opacity,
      }}
    >
      <div
        dir={isRtl ? "rtl" : "ltr"}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.82)",
          borderRadius: 18,
          padding: "20px 36px",
          maxWidth: "84%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}
      >
        <p
          style={{
            color: "white",
            fontSize: subtitleSize,
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontWeight: 600,
            lineHeight: 1.45,
            textAlign: "center",
            margin: 0,
            direction: isRtl ? "rtl" : "ltr",
            textShadow: "0 1px 6px rgba(0,0,0,0.8)",
            wordBreak: "break-word",
            letterSpacing: "0.01em",
          }}
        >
          {active.text}
        </p>
      </div>
    </div>
  )
}
