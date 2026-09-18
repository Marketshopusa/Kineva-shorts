export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { synthesizeEdge } from "@/lib/providers/tts/edge.js"
import { getNeuralVoiceForLang } from "@/lib/providers/tts/voices.js"

const ALLOWED = new Set(["en-US-JennyNeural", "es-MX-DaliaNeural"])

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const lang = body.lang === "es" ? "es" : "en"
    const voice = String(body.voice || getNeuralVoiceForLang(lang)).trim()
    if (!ALLOWED.has(voice)) {
      return Response.json({ error: "Voice not allowed on probe" }, { status: 400 })
    }
    const text = String(body.text || "Kineva staging probe.").trim().slice(0, 280)
    const result = await synthesizeEdge({ text, lang, voice })
    return Response.json({
      ok: true,
      voice: result.voice,
      mimeType: result.mimeType,
      bytes: result.buffer?.length || 0,
      durationSec: result.durationSec,
      engine: result.engine,
      via: result.via || "local-python",
    })
  } catch (err) {
    const msg = String(err?.message || err)
    const code = msg.includes("EDGE_TTS_VERCEL_PYTHON_BLOCKED")
      ? "EDGE_TTS_VERCEL_PYTHON_BLOCKED"
      : msg.includes("EDGE_TTS_RUNTIME_BLOCKED")
        ? "EDGE_TTS_RUNTIME_BLOCKED"
        : undefined
    return Response.json({ ok: false, error: msg.slice(0, 400), code }, { status: 501 })
  }
}
