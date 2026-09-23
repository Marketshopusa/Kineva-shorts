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

/** Admin session, CLI key, or one-shot KINEVA_TASK_TOKEN for production agent runs. */
export async function requireAdminOrTaskToken() {
  const session = await requireAdmin()
  if (session) return session
  const token = process.env.KINEVA_TASK_TOKEN
  if (!token) return null
  const hdr = await headers()
  if (hdr.get("x-kineva-task-token") === token) {
    return { user: { id: "task", email: "task@local" } }
  }
  return null
}
