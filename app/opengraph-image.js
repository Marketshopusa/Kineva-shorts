import { ImageResponse } from "next/og"

export const alt = "Kineva — Series dramáticas cortas con IA"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0B1020",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          position: "relative",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: "#7A2948", display: "flex" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: "#2EC4B6", display: "flex" }} />

        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 40,
            background: "#141A2E",
            border: "4px solid #E8B86D",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 96,
            fontWeight: 700,
            color: "#E8B86D",
          }}
        >
          K
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 620 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#F4EFE6",
              letterSpacing: 8,
              lineHeight: 1,
              display: "flex",
            }}
          >
            KINEVA
          </div>
          <div style={{ width: 200, height: 2, background: "#E8B86D", display: "flex" }} />
          <div
            style={{
              fontSize: 26,
              color: "rgba(244,239,230,0.7)",
              letterSpacing: 1,
              lineHeight: 1.5,
              display: "flex",
            }}
          >
            Drama corto · Storytelling · IA
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
