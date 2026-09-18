import test from "node:test"
import assert from "node:assert/strict"
import { renderPath, RENDERS_BUCKET } from "../../lib/supabase-storage.js"

test("render path is stable and not mixed with dubs", () => {
  assert.equal(RENDERS_BUCKET, "renders")
  assert.equal(renderPath(1, 1), "series/1/episodes/1/kineva-demo.mp4")
  assert.equal(renderPath(12, 34), "series/12/episodes/34/kineva-demo.mp4")
})
