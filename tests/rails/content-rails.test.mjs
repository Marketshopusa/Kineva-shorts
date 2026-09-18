import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveContentRail,
  inspectRailReadiness,
  assertAdapterMatchesRail,
  normalizeRating,
  summarizeRail,
} from "../../lib/content-rails.js"
import { dispatchStill, isQuotaError, quotaBlockMessage } from "../../lib/providers/images/select.js"

function expectRail(id, expected) {
  const rail = resolveContentRail(id)
  assert.equal(rail.textProvider, expected.text)
  assert.equal(rail.imageProvider, expected.image)
  assert.equal(rail.voiceProvider, expected.voice)
  assert.equal(rail.videoProvider, expected.video)
}

test("SFW rail: gemini text/image, edge, remotion", () => {
  expectRail("sfw", { text: "gemini", image: "gemini", voice: "edge", video: "remotion" })
  assert.equal(resolveContentRail("sfw").blocked.includes("leonardo"), true)
})

test("MATURE rail: qwen, fal, edge, remotion — not leonardo or gemini image", () => {
  const rail = resolveContentRail("mature")
  expectRail("mature", { text: "qwen", image: "fal", voice: "edge", video: "remotion" })
  assert.equal(rail.blocked.includes("leonardo"), true)
  assert.equal(rail.blocked.includes("gemini"), true)
  assert.throws(() => assertAdapterMatchesRail(rail, "image", "leonardo"), /RAIL_MISMATCH/)
  assert.throws(() => assertAdapterMatchesRail(rail, "image", "gemini"), /RAIL_MISMATCH/)
})

test("EXPLICIT rail: qwen, fal, edge, remotion — never silent Gemini", () => {
  const rail = resolveContentRail("explicit")
  expectRail("explicit", { text: "qwen", image: "fal", voice: "edge", video: "remotion" })
  assert.throws(() => assertAdapterMatchesRail(rail, "text", "gemini"), /RAIL_MISMATCH/)
  assert.throws(() => assertAdapterMatchesRail(rail, "image", "gemini"), /RAIL_MISMATCH/)
})

test("unknown rating does not collapse to explicit", () => {
  assert.throws(() => resolveContentRail("nsfw"), /UNKNOWN_RATING/)
  assert.throws(() => resolveContentRail(""), /UNKNOWN_RATING/)
  assert.equal(normalizeRating("bogus"), "sfw")
})

test("voice is always edge; video always remotion", () => {
  for (const id of ["sfw", "mature", "explicit"]) {
    const r = resolveContentRail(id)
    assert.equal(r.voiceProvider, "edge")
    assert.equal(r.videoProvider, "remotion")
  }
})

test("summarizeRail dry-run matches assigned backends", () => {
  assert.deepEqual(summarizeRail("sfw"), { text: "gemini", image: "gemini", voice: "edge", video: "remotion" })
  assert.deepEqual(summarizeRail("mature"), { text: "qwen", image: "fal", voice: "edge", video: "remotion" })
  assert.deepEqual(summarizeRail("explicit"), { text: "qwen", image: "fal", voice: "edge", video: "remotion" })
})

test("Gemini 429 does not call Fal", async () => {
  let fal = 0
  await assert.rejects(
    () => dispatchStill("gemini", {
      gemini: async () => {
        const e = new Error(quotaBlockMessage("gemini"))
        e.status = 429
        throw e
      },
      fal: async () => {
        fal += 1
        return "paid"
      },
    }),
    (err) => isQuotaError(err) && fal === 0,
  )
})

test("Gemini 429 does not call Leonardo", async () => {
  let leo = 0
  await assert.rejects(
    () => dispatchStill("gemini", {
      gemini: async () => {
        const e = new Error(quotaBlockMessage("gemini"))
        e.status = 429
        throw e
      },
      leonardo: async () => {
        leo += 1
        return "paid"
      },
    }),
    (err) => isQuotaError(err) && leo === 0,
  )
})

test("Fal failure does not call Gemini", async () => {
  let gem = 0
  await assert.rejects(
    () => dispatchStill("fal", {
      fal: async () => {
        throw new Error("BLOCKED_BALANCE (image): TOP_UP")
      },
      gemini: async () => {
        gem += 1
        return "nope"
      },
    }),
    (err) => /BLOCKED_BALANCE/.test(err.message) && gem === 0,
  )
})

test("mature without Qwen is BLOCKED_CONFIG; Fal without allow is BLOCKED_BALANCE", () => {
  const rail = resolveContentRail("mature")
  const ready = inspectRailReadiness(rail, { QWEN_API_KEY: "", FAL_KEY: "x" })
  const codes = ready.blocks.map((b) => b.code)
  assert.equal(codes.includes("BLOCKED_CONFIG"), true)
  assert.equal(codes.includes("BLOCKED_BALANCE"), true)
  assert.equal(ready.ready, false)
})
