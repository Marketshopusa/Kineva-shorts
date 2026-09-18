import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  getDubStorageMode,
  localDubRelPath,
  putDub,
} from "../../lib/dub-storage.js"

test("local mode does not require SUPABASE_URL", () => {
  const prevS = process.env.SUPABASE_URL
  const prevD = process.env.DUB_STORAGE
  delete process.env.SUPABASE_URL
  process.env.DUB_STORAGE = "local"
  assert.equal(getDubStorageMode(), "local")
  if (prevS === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = prevS
  if (prevD === undefined) delete process.env.DUB_STORAGE
  else process.env.DUB_STORAGE = prevD
})

test("unset DUB_STORAGE with no supabase url is local", () => {
  const prevS = process.env.SUPABASE_URL
  const prevD = process.env.DUB_STORAGE
  delete process.env.SUPABASE_URL
  delete process.env.DUB_STORAGE
  assert.equal(getDubStorageMode(), "local")
  if (prevS === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = prevS
  if (prevD === undefined) delete process.env.DUB_STORAGE
  else process.env.DUB_STORAGE = prevD
})

test("path encodes series, episode, lang, scene", () => {
  assert.equal(localDubRelPath(2, 1, "en", 3), "media/dubs/2/1/en/3.mp3")
  assert.notEqual(localDubRelPath(2, 1, "en", 0), localDubRelPath(2, 99, "en", 0))
})

test("putDub local writes buffer without supabase", async () => {
  const prevCwd = process.cwd()
  const prevD = process.env.DUB_STORAGE
  const prevS = process.env.SUPABASE_URL
  const dir = await mkdtemp(path.join(os.tmpdir(), "dub-stor-"))
  process.chdir(dir)
  process.env.DUB_STORAGE = "local"
  delete process.env.SUPABASE_URL
  try {
    const buf = Buffer.from("ID3test")
    const stored = await putDub({
      seriesId: 2,
      episodeId: 1,
      lang: "en",
      sceneIndex: 0,
      buffer: buf,
      contentType: "audio/mpeg",
    })
    assert.equal(stored.mode, "local")
    assert.equal(stored.path, "media/dubs/2/1/en/0.mp3")
    const onDisk = await readFile(path.join(dir, "public", stored.path))
    assert.equal(onDisk.equals(buf), true)
  } finally {
    process.chdir(prevCwd)
    if (prevD === undefined) delete process.env.DUB_STORAGE
    else process.env.DUB_STORAGE = prevD
    if (prevS === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = prevS
    await rm(dir, { recursive: true, force: true })
  }
})
