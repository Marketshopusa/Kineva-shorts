import { blockedBalance, blockedConfig } from "../../content-rails.js"

const FAL_GENERATE_URL = "https://fal.run/fal-ai/flux/dev"
const FAL_BILLING_DASHBOARD = "https://fal.ai/dashboard/billing"
const FAL_BILLING_URLS = [
  "https://api.fal.ai/v1/account/billing?expand=credits",
  "https://rest.alpha.fal.ai/billing/user",
  "https://api.fal.ai/v1/platform/account",
]

function falAuthHeader(key) {
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" }
}

function asNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function remainingFromPayload(json) {
  if (!json || typeof json !== "object") return null
  return (
    asNumber(json?.credits?.current_balance) ??
    asNumber(json?.remaining_credit) ??
    asNumber(json?.remainingCredit) ??
    asNumber(json?.balance) ??
    asNumber(json?.credit_balance) ??
    asNumber(json?.data?.remaining_credit) ??
    asNumber(json?.user?.balance) ??
    (typeof json?.credits === "number" ? asNumber(json.credits) : null)
  )
}

/** Never log the key. Returns { ok, remainingUsd, status, detail } with no secrets. */
export async function checkFalBalance(env = process.env, fetchFn = fetch) {
  const key = env.FAL_KEY
  if (!key) throw blockedConfig("image", "FAL_KEY absent")

  let lastStatus = 0
  let lastDetail = "no billing endpoint responded"
  for (const url of FAL_BILLING_URLS) {
    const res = await fetchFn(url, { headers: falAuthHeader(key) })
    lastStatus = res.status
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    if (!res.ok) {
      lastDetail = `billing HTTP ${res.status}`
      continue
    }
    const remainingUsd = remainingFromPayload(json)
    return {
      ok: true,
      remainingUsd,
      status: res.status,
      endpoint: url.replace(/https:\/\//, ""),
      dashboard: FAL_BILLING_DASHBOARD,
    }
  }
  if (lastStatus === 401 || lastStatus === 403) {
    throw blockedConfig("image", "Fal billing unauthorized")
  }
  // Unreadable wallet is not proof of $0. FAL_ALLOW_GENERATE remains the spend gate;
  // the generate call itself returns 402 if Fal is actually empty.
  return {
    ok: true,
    remainingUsd: null,
    status: lastStatus,
    endpoint: null,
    dashboard: FAL_BILLING_DASHBOARD,
    detail: lastDetail,
  }
}

export function requireFalSpendReady(balance) {
  if (!balance?.ok) {
    throw blockedBalance("image", `FAL_TOP_UP_REQUIRED ${FAL_BILLING_DASHBOARD}`)
  }
  if (balance.remainingUsd != null && balance.remainingUsd <= 0) {
    throw blockedBalance("image", `FAL_TOP_UP_REQUIRED ${FAL_BILLING_DASHBOARD}`)
  }
  return balance
}

export function falBlockedCode(err) {
  const msg = String(err?.message || err)
  if (/Fal generate locked/i.test(msg)) return "FAL_GENERATE_LOCKED"
  if (/FAL_TOP_UP_REQUIRED/i.test(msg)) return "FAL_TOP_UP_REQUIRED"
  if (/BLOCKED_BALANCE/i.test(msg)) return "FAL_TOP_UP_REQUIRED"
  return null
}

async function toDataUrl(imageUrl, fetchFn) {
  const res = await fetchFn(imageUrl)
  if (!res.ok) throw new Error(`Fal image download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const mime = res.headers.get("content-type") || "image/jpeg"
  return `data:${mime};base64,${buf.toString("base64")}`
}

export async function generateFalStill(prompt, env = process.env, fetchFn = fetch) {
  const key = env.FAL_KEY
  if (!key) throw blockedConfig("image", "FAL_KEY absent")
  if (env.FAL_ALLOW_GENERATE !== "1") {
    throw blockedBalance("image", "Fal generate locked ($0). No Gemini/Leonardo fallback.")
  }
  const balance = requireFalSpendReady(await checkFalBalance(env, fetchFn))

  const res = await fetchFn(FAL_GENERATE_URL, {
    method: "POST",
    headers: falAuthHeader(key),
    body: JSON.stringify({
      prompt,
      image_size: { width: 1080, height: 1920 },
      num_images: 1,
      enable_safety_checker: true,
    }),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg = String(json?.detail || json?.error || `HTTP ${res.status}`)
    if (/insufficient|balance|credit|top.?up|payment/i.test(msg) || res.status === 402) {
      throw blockedBalance("image", `FAL_TOP_UP_REQUIRED ${FAL_BILLING_DASHBOARD}`)
    }
    throw new Error(`PROVIDER_ERROR (image): Fal generate failed (${res.status})`)
  }
  const url = json?.images?.[0]?.url || json?.image?.url
  if (!url) throw new Error("PROVIDER_ERROR (image): Fal returned no image URL")
  const dataUrl = await toDataUrl(url, fetchFn)
  return { dataUrl, balance }
}

export { FAL_BILLING_DASHBOARD, FAL_BILLING_URLS, FAL_GENERATE_URL }
