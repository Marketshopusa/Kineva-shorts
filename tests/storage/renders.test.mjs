import test from "node:test"
import assert from "node:assert/strict"
import { renderPath, renderCandidates, RENDERS_BUCKET } from "../../lib/supabase-storage.js"

test("render path is stable and not mixed with dubs", () => {
  assert.equal(RENDERS_BUCKET, "renders")
  assert.equal(renderPath(1, 1), "series/1/episodes/1/kineva-demo.mp4")
  assert.equal(renderPath(12, 34), "series/12/episodes/34/episode-1.mp4")
  assert.deepEqual(renderCandidates(2, 9), [
    "series/2/episodes/9/episode-1.mp4",
    "series/2/episodes/9/kineva-demo.mp4",
  ])
})
