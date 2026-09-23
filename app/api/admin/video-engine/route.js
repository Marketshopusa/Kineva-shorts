export const dynamic = "force-dynamic"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import { jsonRailError } from "@/lib/http-rail-error"
import { inspectClipEngineReadiness } from "@/lib/video-engine.js"
import { auditMinimaxH3 } from "@/lib/providers/video/minimax-h3.js"

export async function GET() {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const clip = inspectClipEngineReadiness()
    const audit = auditMinimaxH3()
    return Response.json({
      standardProvider: clip.engine.id,
      mode: clip.engine.mode,
      model: clip.engine.model,
      paidExternal: clip.engine.paidExternal,
      ready: clip.ready,
      blocks: clip.blocks,
      falVideoCalls: 0,
      premiumFrozen: !clip.engine.paidExternal,
      productModes: {
        preview: "stills + Remotion Ken Burns animatic",
        standard: "self_hosted_workflow MiniMax H3 (default)",
        premium: "kling/veo/runway/luma — disabled until PREMIUM_VIDEO_ALLOW=1",
      },
      minimax: audit,
    })
  } catch (err) {
    return jsonRailError(err) || Response.json({ error: err.message }, { status: 500 })
  }
}
