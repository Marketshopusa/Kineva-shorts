import { registerRoot, Composition } from "remotion"
import DramaVideo from "./DramaVideo"
import MotionVideo, { motionDurationInFrames } from "./MotionVideo"
import { calculateTotalFrames, ensureReadableDurations } from "../lib/subtitleUtils"

const FPS = 30

function Root() {
  return (
    <>
      <Composition
        id="DramaVideo"
        component={DramaVideo}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          scenes: [],
          imageUrls: [],
          language: "en",
          isRtl: false,
          fps: FPS,
          watermark: false,
          watermarkText: "KINEVA",
          watermarkSize: 48,
          watermarkColor: "#FFFFFF",
          watermarkOpacity: 0.4,
          musicUrl: null,
          dubScenes: null,
        }}
        calculateMetadata={({ props }) => {
          const adjusted = ensureReadableDurations(props.scenes, props.language)
          const frames = calculateTotalFrames(adjusted, FPS, 15, props.dubScenes)
          return { durationInFrames: Math.max(frames, 1) }
        }}
      />
      <Composition
        id="MotionVideo"
        component={MotionVideo}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          shots: [],
          language: "es",
          isRtl: false,
          fps: FPS,
          watermark: true,
          watermarkText: "KINEVA",
          watermarkSize: 28,
          watermarkColor: "#FFFFFF",
          watermarkOpacity: 0.28,
          subtitleEnabled: true,
          subtitleSize: 52,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: motionDurationInFrames(props.shots, FPS),
        })}
      />
    </>
  )
}

registerRoot(Root)
