import { Sequence, Audio, useCurrentFrame, interpolate } from "remotion"
import { useMemo } from "react"
import Scene from "./Scene"
import Watermark from "./Watermark"
import { ensureReadableDurations } from "../lib/subtitleUtils"

const TRANSITION_FRAMES = 15 // 0.5s black fade between scenes

function BlackFade({ durationFrames }) {
  const frame = useCurrentFrame()
  // Fade from black → transparent in first half, transparent → black in second half
  const mid = durationFrames / 2
  const opacity = frame < mid
    ? interpolate(frame, [0, mid], [1, 0], { extrapolateRight: "clamp" })
    : interpolate(frame, [mid, durationFrames], [0, 1], { extrapolateLeft: "clamp" })

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#000",
        opacity,
        zIndex: 10,
      }}
    />
  )
}

export default function DramaVideo({ scenes: rawScenes, imageUrls, language, isRtl, fps = 30, watermark = false, watermarkText = "KINEVA", watermarkSize = 48, watermarkColor = "#FFFFFF", watermarkOpacity = 0.4, musicUrl = null, musicVolume = 1.0, dubScenes = null, subtitleEnabled = true, subtitleSize = 62 }) {
  const scenes = useMemo(
    () => ensureReadableDurations(rawScenes, language),
    [rawScenes, language]
  )

  if (!scenes?.length) return null

  let frameOffset = 0
  const elements = []

  scenes.forEach((scene, i) => {
    const baseDuration = (scene.duration_sec || 5) * fps

    // Support both legacy string format and new { url, durationSec } object
    const dubInfo = dubScenes?.[String(i)]
    const dubUrl = typeof dubInfo === "string" ? dubInfo : dubInfo?.url
    const dubDurationSec = typeof dubInfo === "object" && dubInfo !== null ? dubInfo.durationSec : null

    // Extend scene to fit the full audio clip; never shrink below screenplay duration
    const effectiveDuration = dubDurationSec
      ? Math.max(baseDuration, Math.ceil(dubDurationSec * fps))
      : baseDuration

    // Scene sequence
    elements.push(
      <Sequence key={`scene-${i}`} from={frameOffset} durationInFrames={effectiveDuration}>
        <Scene
          scene={scene}
          imageUrl={imageUrls?.[i]}
          language={language}
          isRtl={isRtl}
          fps={fps}
          dubDurationSec={dubDurationSec}
          subtitleEnabled={subtitleEnabled}
          subtitleSize={subtitleSize}
        />
      </Sequence>
    )

    // Per-scene narrator dub audio
    if (dubUrl) {
      elements.push(
        <Sequence key={`dub-${i}`} from={frameOffset} durationInFrames={effectiveDuration}>
          <Audio src={dubUrl} volume={0.9} />
        </Sequence>
      )
    }

    frameOffset += effectiveDuration

    // Transition between scenes (not after last scene)
    if (i < scenes.length - 1) {
      elements.push(
        <Sequence key={`transition-${i}`} from={frameOffset} durationInFrames={TRANSITION_FRAMES}>
          <div style={{ width: 1080, height: 1920, backgroundColor: "#000" }}>
            <BlackFade durationFrames={TRANSITION_FRAMES} />
          </div>
        </Sequence>
      )
      frameOffset += TRANSITION_FRAMES
    }
  })

  // Duck music when narrator dub is present
  const effectiveMusicVolume = dubScenes ? (musicVolume ?? 1.0) * 0.15 : (musicVolume ?? 1.0) * 0.3

  return (
    <div style={{ width: 1080, height: 1920, backgroundColor: "#000" }}>
      {elements}
      {musicUrl && <Audio src={musicUrl} volume={effectiveMusicVolume} loop />}
      {watermark && <Watermark text={watermarkText} size={watermarkSize} color={watermarkColor} opacity={watermarkOpacity} />}
    </div>
  )
}
