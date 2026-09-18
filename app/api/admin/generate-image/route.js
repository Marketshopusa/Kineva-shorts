export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"

/** Leonardo is not assigned to any contentRating rail. */
export async function POST() {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json(
    { error: "RAIL_MISMATCH: Leonardo is not on any content rail (no silent fallback)" },
    { status: 400 },
  )
}
