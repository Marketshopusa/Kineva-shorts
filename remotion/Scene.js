import { useCurrentFrame, interpolate, Img } from "remotion"
import Subtitle from "./Subtitle"

export default function Scene({ scene, imageUrl, language, isRtl, fps = 30, dubDurationSec = null, subtitleEnabled = true, subtitleSize = 62 }) {
  const frame = useCurrentFrame()
  const baseDurationSec = scene.duration_sec || 5
  // When dub is active, extend the zoom range to fill the actual audio duration
  const effectiveDurationSec = dubDurationSec ? Math.max(baseDurationSec, dubDurationSec) : baseDurationSec
  const durationFrames = effectiveDurationSec * fps
  const textKey = `text_${language}`

  // Ken Burns zoom effect scaled to effective duration
  const zoomIn = scene.zoom_direction !== "out"
  const scale = interpolate(
    frame,
    [0, durationFrames],
    zoomIn ? [1, 1.15] : [1.15, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )

  return (
    <div style={{ width: 1080, height: 1920, position: "relative", overflow: "hidden", backgroundColor: "#000" }}>
      {/* Image with Ken Burns */}
      {imageUrl && (
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <Img
            src={imageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      )}

      {/* Subtitle overlay — use actual audio duration so chunks track the voice */}
      <Subtitle
        text={scene[textKey] || ""}
        durationSec={effectiveDurationSec}
        fps={fps}
        isRtl={isRtl}
        customChunks={scene.subtitles?.[language] || null}
        subtitleEnabled={subtitleEnabled}
        subtitleSize={subtitleSize}
      />
    </div>
  )
}
