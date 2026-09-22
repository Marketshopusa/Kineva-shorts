import test from "node:test"
import assert from "node:assert/strict"
import {
  assertImagesBucketReady,
  chooseImagesBucket,
  ensurePrivateImagesBucket,
  inspectImagesStorage,
} from "../../lib/storage-preflight.js"
import { persistCharacterCandidate } from "../../lib/character-reference-storage.js"
import { isCanonicalStoragePath, elenaMasterGenerateAllowed } from "../../lib/character-master.js"
import { visualIdentityStatus } from "../../lib/character-identity.js"
import { findRecentElenaMasterStill, selectRecoverableElenaStill } from "../../lib/fal-history.js"

test("missing images bucket is not ready", () => {
  const choice = chooseImagesBucket([{ name: "dubs", public: false }, { name: "renders", public: false }])
  assert.equal(choice.action, "CREATE")
  assert.equal(choice.bucket, "images")
})

test("existing images bucket is reused and stays private", () => {
  const choice = chooseImagesBucket([{ name: "images", public: false }, { name: "dubs", public: false }])
  assert.equal(choice.action, "EXISTED")
  assert.equal(choice.private, true)
})

test("bucket missing throws before a generate callback", async () => {
  let generateCalls = 0
  await assert.rejects(
    () => assertImagesBucketReady({
      listFn: async () => [{ name: "dubs", public: false }],
    }),
    /IMAGES_BUCKET not ready/,
  )
  assert.equal(generateCalls, 0)
})

test("ready bucket allows generate callback exactly once", async () => {
  let generateCalls = 0
  const inspect = await assertImagesBucketReady({
    listFn: async () => [{ name: "images", public: false }],
  })
  assert.equal(inspect.ready, true)
  generateCalls += 1
  assert.equal(generateCalls, 1)
  assert.equal(elenaMasterGenerateAllowed([{ path: "characters/2/2/candidates/x.png" }]), false)
})

test("ensure creates private images when missing and never touches dubs", async () => {
  const created = []
  const listed = [{ name: "dubs", public: false }, { name: "renders", public: false }]
  const result = await ensurePrivateImagesBucket({
    listFn: async () => listed,
    createFn: async (name, opts) => {
      created.push({ name, public: opts.public })
      listed.push({ name, public: false })
    },
  })
  assert.equal(created[0].name, "images")
  assert.equal(created[0].public, false)
  assert.equal(result.action, "CREATED")
  assert.equal(listed.some((bucket) => bucket.name === "dubs"), true)
})

test("candidate persist is not canonical and does not lock identity", async () => {
  const uploads = []
  const path = await persistCharacterCandidate({
    seriesId: 2,
    characterId: 2,
    candidateId: "recov",
    imageUrl: "data:image/png;base64,aGVsbG8=",
    uploadFn: async (bucket, storagePath) => {
      uploads.push({ bucket, storagePath })
    },
  })
  assert.equal(path, "characters/2/2/candidates/recov.png")
  assert.equal(isCanonicalStoragePath(path), false)
  const character = { referenceImageUrl: null }
  assert.equal(visualIdentityStatus(character), "NOT LOCKED")
})

test("canonical lock is only after referenceImageUrl is set", () => {
  assert.equal(visualIdentityStatus({ referenceImageUrl: null }), "NOT LOCKED")
  assert.equal(visualIdentityStatus({ referenceImageUrl: "characters/2/2/canonical.png" }), "LOCKED")
})

test("Fal history recovers Elena master still without POST generate", async () => {
  let posts = 0
  const fetchFn = async (url, opts = {}) => {
    if (String(opts.method || "GET").toUpperCase() === "POST") {
      posts += 1
    }
    return new Response(JSON.stringify({
      items: [{
        request_id: "11111111-1111-1111-1111-111111111111",
        endpoint_id: "fal-ai/flux/dev",
        ended_at: "2026-09-22T22:18:20Z",
        status_code: 200,
        json_input: { prompt: "ELENA VARELA — CHARACTER MASTER\nSingle adult woman" },
        json_output: { images: [{ url: "https://v3.fal.media/files/example/elena.png" }] },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  const found = await findRecentElenaMasterStill({ FAL_KEY: "x" }, fetchFn)
  assert.equal(found.recoverable, true)
  assert.equal(found.imageUrl.endsWith("elena.png"), true)
  assert.equal(posts, 0)
})

test("history without Elena master is not recoverable", () => {
  const found = selectRecoverableElenaStill([{
    json_input: { prompt: "a cat" },
    json_output: { images: [{ url: "https://example.invalid/x.png" }] },
  }])
  assert.equal(found, null)
})

test("inspect reports storage buckets without secrets", async () => {
  const inspect = await inspectImagesStorage({
    listFn: async () => [{ name: "dubs", public: false }, { name: "images", public: false }],
  })
  assert.deepEqual(inspect.buckets.map((bucket) => bucket.name).sort(), ["dubs", "images"])
  assert.equal(inspect.ready, true)
})
