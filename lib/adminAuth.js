/**
 * adminAuth — drop-in replacement for `auth()` in admin API routes.
 *
 * Checks, in order:
 *   1. x-cli-key header matching CLI_API_KEY env var  →  MCP / batch scripts
 *   2. admin-token JWT cookie  →  normal browser login flow
 *
 * Returns a session-like object { user: { id, email } } or null.
 */

import { verifyAdminToken } from "@/lib/admin-auth"
import { headers } from "next/headers"

export async function requireAdmin() {
  // 1. CLI key — for MCP server and batch scripts
  const cliKey = process.env.CLI_API_KEY
  if (cliKey) {
    const hdr = await headers()
    if (hdr.get("x-cli-key") === cliKey) {
      return { user: { id: "cli", email: "cli@local" } }
    }
  }

  // 2. Custom admin JWT cookie
  const payload = await verifyAdminToken()
  if (!payload) return null
  return { user: { id: payload.userId, email: payload.email } }
}
