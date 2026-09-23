import { OffthreadVideo } from "remotion"
import Subtitle from "./Subtitle"

/**
 * One AI video shot. Motion comes from the generated MP4, never from CSS scale.
 */
export default function MotionShot({
  src,
  language = "es",
  isRtl = false,
  fps = 30,
  durationSec = 6,
  text = "",
  customChunks = null,
  subtitleEnabled = true,
  subtitleSize = 52,
}) {
  if (!src) return null
  return (
    <div style={{ width: 1080, height: 1920, position: "relative", overflow: "hidden", backgroundColor: "#000" }}>
      <OffthreadVideo
        src={src}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <Subtitle
        text={text}
        durationSec={durationSec}
        fps={fps}
        isRtl={isRtl}
        customChunks={customChunks}
        subtitleEnabled={subtitleEnabled}
        subtitleSize={subtitleSize}
      />
    </div>
  )
}
