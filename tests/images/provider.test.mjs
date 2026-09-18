import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveImageProvider,
  dispatchStill,
  isQuotaError,
  quotaBlockMessage,
} from "../../lib/providers/images/select.js"

test("gemini selection never invokes leonardo adapter", async () => {
  let gemini = 0
  let leonardo = 0
  const { provider, dataUrl } = await dispatchStill("gemini", {
    gemini: async () => {
      gemini += 1
      return "data:image/png;base64,xx"
    },
    leonardo: async () => {
      leonardo += 1
      return "should-not-run"
    },
  })
  assert.equal(provider, "gemini")
  assert.equal(dataUrl.startsWith("data:image"), true)
  assert.equal(gemini, 1)
  assert.equal(leonardo, 0)
})

test("quota errors do not dispatch a paid fallback", async () => {
  await assert.rejects(
    () => dispatchStill("gemini", {
      gemini: async () => {
        const e = new Error(quotaBlockMessage("gemini"))
        e.status = 429
        throw e
      },
      leonardo: async () => "paid",
    }),
    (err) => isQuotaError(err) && !String(err.message).includes("Leonardo"),
  )
})

test("unknown provider is rejected", () => {
  assert.throws(() => resolveImageProvider("flux"), /Unknown/)
})
