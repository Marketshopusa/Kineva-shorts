import test from "node:test"
import assert from "node:assert/strict"
import { checkFalBalance, generateFalStill, probeFalAccount, requireFalSpendReady } from "../../lib/providers/images/fal.js"

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

test("checkFalBalance reads credits.current_balance from billing expand", async () => {
  const fetchFn = async (url) => {
    if (String(url).includes("account/billing")) {
      return jsonResponse(200, { credits: { current_balance: 8.25 } })
    }
    return jsonResponse(404, {})
  }
  const bal = await checkFalBalance({ FAL_KEY: "x" }, fetchFn)
  assert.equal(bal.remainingUsd, 8.25)
})

test("unreadable billing without a zero wallet does not block generate", async () => {
  let generateCalls = 0
  const fetchFn = async (url) => {
    if (String(url).includes("billing") || String(url).includes("platform/account")) {
      return jsonResponse(404, { error: "not found" })
    }
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

test("GET probe of a locked Fal account does not POST generate", async () => {
  let posts = 0
  const fetchFn = async (url, opts = {}) => {
    if (String(url).includes("billing") || String(url).includes("platform/account")) {
      return jsonResponse(404, { error: { type: "not_found", message: "not found" } })
    }
    if (String(url).includes("fal.run")) {
      if (String(opts.method || "GET").toUpperCase() === "POST") {
        posts += 1
        return jsonResponse(200, { images: [{ url: "https://cdn.example/still.jpg" }] })
      }
      return jsonResponse(403, { detail: "User is locked. Reason: TOP_UP." })
    }
    return jsonResponse(404, {})
  }
  const probe = await probeFalAccount({ FAL_KEY: "x", FAL_ALLOW_GENERATE: "1" }, fetchFn)
  assert.equal(probe.generateLocked, true)
  assert.equal(probe.keyMatch, "NO")
  assert.equal(posts, 0)
})
