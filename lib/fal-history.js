/**
 * Read-only Fal request history. Never POST / generate / spend.
 */
const HISTORY_URLS = [
  "https://api.fal.ai/v1/models/requests/by-endpoint?endpoint_id=fal-ai/flux/dev&limit=20&expand=payloads&status=success",
  "https://api.fal.ai/v1/serverless/requests/by-endpoint?endpoint_id=fal-ai/flux/dev&limit=20&expand=payloads&status=success",
]

function falAuthHeader(key) {
  return { Authorization: `Key ${key}`, Accept: "application/json" }
}

function promptText(item) {
  const input = item?.json_input || item?.input || {}
  return String(input.prompt || input.input?.prompt || "")
}

function imageUrlFrom(item) {
  const output = item?.json_output || item?.output || item
  return (
    output?.images?.[0]?.url ||
    output?.image?.url ||
    output?.data?.images?.[0]?.url ||
    null
  )
}

export function isElenaMasterHistoryItem(item) {
  const prompt = promptText(item)
  if (!/ELENA VARELA — CHARACTER MASTER/.test(prompt)) return false
  if (/Mateo|Iván|Ivan Cruz/i.test(prompt) && /scene still/i.test(prompt)) return false
  return !!imageUrlFrom(item)
}

export function selectRecoverableElenaStill(items) {
  const matches = (Array.isArray(items) ? items : []).filter(isElenaMasterHistoryItem)
  if (!matches.length) return null
  const preferred = matches.find((item) => {
    const ended = Date.parse(item.ended_at || item.started_at || "")
    if (!Number.isFinite(ended)) return false
    // The successful Production generate finished ~2026-09-22T22:18:26Z
    return Math.abs(ended - Date.parse("2026-09-22T22:18:26Z")) < 30 * 60 * 1000
  })
  const item = preferred || matches[0]
  return {
    requestId: item.request_id || item.requestId || null,
    imageUrl: imageUrlFrom(item),
    endedAt: item.ended_at || item.started_at || null,
    statusCode: item.status_code || item.statusCode || null,
  }
}

export async function findRecentElenaMasterStill(env = process.env, fetchFn = fetch) {
  const key = env.FAL_KEY
  if (!key) return { recoverable: false, reason: "FAL_KEY absent" }

  let lastDetail = "history endpoints did not respond"
  for (const url of HISTORY_URLS) {
    const res = await fetchFn(url, { method: "GET", headers: falAuthHeader(key) })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    if (!res.ok) {
      lastDetail = `history HTTP ${res.status}`
      continue
    }
    const found = selectRecoverableElenaStill(json?.items || json?.data || [])
    if (!found?.imageUrl) {
      return { recoverable: false, reason: "no Elena master still in Fal history", requestId: null }
    }
    return { recoverable: true, reason: null, ...found }
  }
  return { recoverable: false, reason: lastDetail, requestId: null }
}
