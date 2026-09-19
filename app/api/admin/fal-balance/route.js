export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import { checkFalBalance, FAL_BILLING_DASHBOARD } from "@/lib/providers/images/fal.js"

export async function GET() {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const hasKey = Boolean(process.env.FAL_KEY)
  const allowGenerate = process.env.FAL_ALLOW_GENERATE === "1"
  if (!hasKey) {
    return Response.json({
      ok: false,
      hasKey: false,
      allowGenerate,
      remainingUsd: null,
      readyToGenerate: false,
      dashboard: FAL_BILLING_DASHBOARD,
      code: "BLOCKED_CONFIG",
      error: "FAL_KEY absent",
    }, { status: 400 })
  }

  try {
    const balance = await checkFalBalance()
    const empty = balance.remainingUsd != null && balance.remainingUsd <= 0
    return Response.json({
      ok: true,
      hasKey: true,
      allowGenerate,
      remainingUsd: balance.remainingUsd,
      readyToGenerate: allowGenerate && !empty,
      dashboard: FAL_BILLING_DASHBOARD,
      endpoint: balance.endpoint || null,
      code: empty ? "FAL_TOP_UP_REQUIRED" : (!allowGenerate ? "FAL_GENERATE_LOCKED" : null),
    })
  } catch (err) {
    const msg = String(err?.message || err)
    const status = err?.code === "BLOCKED_CONFIG" ? 400 : 402
    return Response.json({
      ok: false,
      hasKey: true,
      allowGenerate,
      remainingUsd: null,
      readyToGenerate: false,
      dashboard: FAL_BILLING_DASHBOARD,
      error: msg.slice(0, 400),
      code: err?.code || "PROVIDER_ERROR",
    }, { status })
  }
}
