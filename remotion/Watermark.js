import { AbsoluteFill } from "remotion"

export default function Watermark({ text = "KINEVA", size = 48, color = "#FFFFFF", opacity = 0.4 }) {
  return (
    <AbsoluteFill
      style={{
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 40,
          right: 120,
          color,
          opacity,
          fontSize: size,
          fontWeight: 700,
          letterSpacing: 4,
          fontFamily: "system-ui, -apple-system, sans-serif",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          userSelect: "none",
        }}
      >
        {text}
      </span>
    </AbsoluteFill>
  )
}
