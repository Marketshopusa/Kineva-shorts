export const dynamic = "force-dynamic";
import { clearAdminCookie } from "@/lib/admin-auth"
import { cookies } from "next/headers"

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.set(clearAdminCookie())
  return Response.json({ ok: true })
}
