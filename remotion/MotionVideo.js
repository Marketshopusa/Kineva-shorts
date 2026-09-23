import { Sequence, Audio, useCurrentFrame, interpolate } from "remotion"
import { useMemo } from "react"
import MotionShot from "./MotionShot"
import Watermark from "./Watermark"
import { splitIntoChunks } from "../lib/subtitleUtils"

/** Compositor: MiniMax (or other) VIDEO CLIPs + audio + captions. Not a motion generator. */

const TRANSITION_FRAMES = 4

function BlackFade({ durationFrames }) {
  const frame = useCurrentFrame()
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

export function motionDurationInFrames(shots, fps = 30, transitionFrames = TRANSITION_FRAMES) {
  const list = Array.isArray(shots) ? shots : []
  if (!list.length) return 1
  const shotFrames = list.reduce((sum, shot) => {
    const sec = Number(shot.durationSec || shot.duration || 6)
    return sum + Math.max(1, Math.round(sec * fps))
  }, 0)
  const transitions = Math.max(0, list.length - 1) * transitionFrames
  return Math.max(shotFrames + transitions, 1)
}

export default function MotionVideo({
  shots: rawShots = [],
  language = "es",
  isRtl = false,
  fps = 30,
  watermark = true,
  watermarkText = "KINEVA",
  watermarkSize = 28,
  watermarkColor = "#FFFFFF",
  watermarkOpacity = 0.28,
  subtitleEnabled = true,
  subtitleSize = 52,
}) {
  const shots = useMemo(() => (Array.isArray(rawShots) ? rawShots : []), [rawShots])
  if (!shots.length) return null

  let frameOffset = 0
  const elements = []

  shots.forEach((shot, i) => {
    const durationSec = Number(shot.durationSec || shot.duration || 6)
    const durationFrames = Math.max(1, Math.round(durationSec * fps))
    const text = shot.text || shot.narration || shot.dialogue || shot[`text_${language}`] || ""
    const customChunks = shot.subtitles?.[language] || splitIntoChunks(text, durationSec, fps)
    const videoSrc = shot.src || shot.url || shot.videoUrl
    const dubUrl = shot.audioSrc || shot.dubUrl

    elements.push(
      <Sequence key={`shot-${shot.shotId || i}`} from={frameOffset} durationInFrames={durationFrames}>
        <MotionShot
          src={videoSrc}
          language={language}
          isRtl={isRtl}
          fps={fps}
          durationSec={durationSec}
          text={text}
          customChunks={customChunks}
          subtitleEnabled={subtitleEnabled}
          subtitleSize={subtitleSize}
        />
      </Sequence>,
    )

    if (dubUrl) {
      elements.push(
        <Sequence key={`audio-${shot.shotId || i}`} from={frameOffset} durationInFrames={durationFrames}>
          <Audio src={dubUrl} volume={0.95} />
        </Sequence>,
      )
    }

    frameOffset += durationFrames

    if (i < shots.length - 1 && TRANSITION_FRAMES > 0) {
      elements.push(
        <Sequence key={`cut-${i}`} from={frameOffset} durationInFrames={TRANSITION_FRAMES}>
          <div style={{ width: 1080, height: 1920, backgroundColor: "#000" }}>
            <BlackFade durationFrames={TRANSITION_FRAMES} />
          </div>
        </Sequence>,
      )
      frameOffset += TRANSITION_FRAMES
    }
  })

  return (
    <div style={{ width: 1080, height: 1920, backgroundColor: "#000" }}>
      {elements}
      {watermark && (
        <Watermark
          text={watermarkText}
          size={watermarkSize}
          color={watermarkColor}
          opacity={watermarkOpacity}
        />
      )}
    </div>
  )
}
