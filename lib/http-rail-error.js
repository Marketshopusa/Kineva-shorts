export function jsonRailError(err) {
  const msg = String(err?.message || err)
  const code = err?.code || ""
  if (code === "BLOCKED_CONFIG" || msg.startsWith("BLOCKED_CONFIG")) {
    return Response.json({ error: msg }, { status: 400 })
  }
  if (code === "BLOCKED_BALANCE" || msg.startsWith("BLOCKED_BALANCE")) {
    return Response.json({ error: msg }, { status: 402 })
  }
  if (err?.status === 429 || /BLOQUEADO POR CUOTA/i.test(msg)) {
    return Response.json({ error: msg }, { status: 429 })
  }
  if (code === "UNKNOWN_RATING" || code === "RAIL_MISMATCH" || msg.startsWith("UNKNOWN_RATING") || msg.startsWith("RAIL_MISMATCH")) {
    return Response.json({ error: msg }, { status: 400 })
  }
  if (code === "PROVIDER_ERROR" || msg.startsWith("PROVIDER_ERROR")) {
    return Response.json({ error: msg }, { status: 502 })
  }
  return null
}
