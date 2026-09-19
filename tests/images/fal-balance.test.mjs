import test from "node:test"
import assert from "node:assert/strict"
import {
  checkFalBalance,
  generateFalStill,
  requireFalSpendReady,
  falBlockedCode,
  FAL_BILLING_DASHBOARD,
} from "../../lib/providers/images/fal.js"

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

test("zero Fal credit is FAL_TOP_UP_REQUIRED and does not generate", async () => {
  let generateCalls = 0
  const fetchFn = async (url) => {
    if (String(url).includes("billing") || String(url).includes("platform/account")) {
      return jsonResponse(200, { remaining_credit: 0 })
    }
    generateCalls += 1
    return jsonResponse(200, { images: [{ url: "https://example.invalid/x.png" }] })
  }
  await assert.rejects(
    () => generateFalStill("prompt", { FAL_KEY: "x", FAL_ALLOW_GENERATE: "1" }, fetchFn),
    /FAL_TOP_UP_REQUIRED/,
  )
  assert.equal(generateCalls, 0)
})

test("positive Fal credit allows generate", async () => {
  const fetchFn = async (url) => {
    if (String(url).includes("billing") || String(url).includes("platform/account")) {
      return jsonResponse(200, { remaining_credit: 12.5 })
    }
    if (String(url).includes("fal.run")) {
      return jsonResponse(200, { images: [{ url: "https://cdn.example/still.jpg" }] })
    }
    if (String(url).includes("cdn.example")) {
      return new Response(Buffer.from("fake-jpeg"), { status: 200, headers: { "Content-Type": "image/jpeg" } })
    }
    return jsonResponse(404, {})
  }
  const { dataUrl, balance } = await generateFalStill(
    "cinematic still",
    { FAL_KEY: "x", FAL_ALLOW_GENERATE: "1" },
    fetchFn,
  )
  assert.equal(balance.remainingUsd, 12.5)
  assert.equal(dataUrl.startsWith("data:image/jpeg;base64,"), true)
})

test("requireFalSpendReady blocks empty wallet", () => {
  assert.throws(() => requireFalSpendReady({ ok: true, remainingUsd: 0 }), /FAL_TOP_UP_REQUIRED/)
})

test("checkFalBalance does not throw when remaining is readable", async () => {
  const fetchFn = async () => jsonResponse(200, { remaining_credit: 1 })
  const bal = await checkFalBalance({ FAL_KEY: "x" }, fetchFn)
  assert.equal(bal.remainingUsd, 1)
})

test("official billing payload credits.current_balance is remainingUsd", async () => {
  const fetchFn = async (url) => {
    if (String(url).includes("/v1/account/billing")) {
      return jsonResponse(200, { username: "kineva", credits: { current_balance: 4.25, currency: "USD" } })
    }
    return jsonResponse(404, {})
  }
  const bal = await checkFalBalance({ FAL_KEY: "x" }, fetchFn)
  assert.equal(bal.remainingUsd, 4.25)
  assert.equal(bal.dashboard, FAL_BILLING_DASHBOARD)
})

test("unreadable billing wallet is not treated as FAL_TOP_UP_REQUIRED", async () => {
  let generateCalls = 0
  const fetchFn = async (url) => {
    if (String(url).includes("fal.run")) {
      generateCalls += 1
      return jsonResponse(200, { images: [{ url: "https://cdn.example/still.jpg" }] })
    }
    if (String(url).includes("cdn.example")) {
      return new Response(Buffer.from("fake-jpeg"), { status: 200, headers: { "Content-Type": "image/jpeg" } })
    }
    return jsonResponse(404, {})
  }
  const { dataUrl } = await generateFalStill(
    "cinematic still",
    { FAL_KEY: "x", FAL_ALLOW_GENERATE: "1" },
    fetchFn,
  )
  assert.equal(generateCalls, 1)
  assert.equal(dataUrl.startsWith("data:image/jpeg;base64,"), true)
})

test("falBlockedCode keeps generate lock distinct from top-up", () => {
  assert.equal(
    falBlockedCode(new Error("BLOCKED_BALANCE (image): Fal generate locked ($0). No Gemini/Leonardo fallback.")),
    "FAL_GENERATE_LOCKED",
  )
  assert.equal(
    falBlockedCode(new Error(`BLOCKED_BALANCE (image): FAL_TOP_UP_REQUIRED ${FAL_BILLING_DASHBOARD}`)),
    "FAL_TOP_UP_REQUIRED",
  )
})
