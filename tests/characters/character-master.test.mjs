import test from "node:test"
import assert from "node:assert/strict"
import {
  CHARACTER_MASTER_ASPECT,
  CHARACTER_MASTER_MODEL,
  CHARACTER_MASTER_SIZE,
  buildCharacterMasterPrompt,
  characterCandidatePath,
  characterCandidatePrefix,
  elenaMasterGenerateAllowed,
  isCanonicalStoragePath,
  isElenaVarelaCharacter,
  matchElenaVarela,
} from "../../lib/character-master.js"
import { persistCharacterCandidate } from "../../lib/character-reference-storage.js"

const FIXTURE_ELENA_ID_7 = {
  id: 7,
  seriesId: 2,
  name: "Elena",
  role: "protagonist",
}

const REAL_ELENA = {
  id: 99,
  seriesId: 2,
  name: "Elena Varela",
  role: "Protagonist",
  appearance: {
    basePrompt: "Latina woman in her early 30s, dark wavy hair, brown eyes",
    wardrobeDefault: "cream knit sweater",
    distinguishingFeatures: "small gold hoop earrings",
  },
  personality: {
    traits: ["guarded", "loyal"],
    backstory: "A private investigator who answers one last call.",
  },
}

test("does not treat fixture Character #7 named Elena as Elena Varela", () => {
  assert.equal(isElenaVarelaCharacter(FIXTURE_ELENA_ID_7), false)
  assert.equal(matchElenaVarela([FIXTURE_ELENA_ID_7]), null)
})

test("resolves Elena Varela by seriesId + name + role, not numeric id", () => {
  const mateo = { id: 8, seriesId: 2, name: "Mateo Varela", role: "Supporting" }
  const ivan = { id: 9, seriesId: 2, name: "Iván Cruz", role: "Supporting" }
  const otherSeries = { ...REAL_ELENA, id: 1, seriesId: 1 }
  const found = matchElenaVarela([mateo, FIXTURE_ELENA_ID_7, otherSeries, ivan, REAL_ELENA])
  assert.equal(found?.id, REAL_ELENA.id)
  assert.equal(found?.name, "Elena Varela")
})

test("character master prompt is a portrait, not a scene still", () => {
  const prompt = buildCharacterMasterPrompt(REAL_ELENA, {
    title: "LA ÚLTIMA LLAMADA",
    tone: "cinematic thriller",
    premise: "A last phone call changes everything.",
  })
  assert.match(prompt, /ELENA VARELA — CHARACTER MASTER/)
  assert.match(prompt, /cream knit sweater/)
  assert.match(prompt, /No other people/)
  assert.doesNotMatch(prompt, /Mateo/)
  assert.doesNotMatch(prompt, /Iván|Ivan/)
  assert.match(prompt, /no phone, no apartment/)
  assert.equal(CHARACTER_MASTER_ASPECT, "9:16")
  assert.deepEqual(CHARACTER_MASTER_SIZE, { width: 1080, height: 1920 })
  assert.equal(CHARACTER_MASTER_MODEL, "fal-ai/flux/dev")
})

test("candidate path is not canonical.png", () => {
  const path = characterCandidatePath(2, 42, "cand-1")
  assert.equal(path, "characters/2/42/candidates/cand-1.png")
  assert.equal(isCanonicalStoragePath(path), false)
  assert.equal(isCanonicalStoragePath("characters/2/42/canonical.png"), true)
  assert.equal(characterCandidatePrefix(2, 42), "characters/2/42/candidates")
})

test("a second generate is blocked once a candidate exists", () => {
  assert.equal(elenaMasterGenerateAllowed([]), true)
  assert.equal(elenaMasterGenerateAllowed([{ path: "characters/2/42/candidates/x.png" }]), false)
})

test("persistCharacterCandidate writes candidates/ and never canonical.png", async () => {
  const uploads = []
  const path = await persistCharacterCandidate({
    seriesId: 2,
    characterId: 42,
    candidateId: "first",
    imageUrl: "data:image/png;base64,aGVsbG8=",
    uploadFn: async (bucket, storagePath, buffer, contentType) => {
      uploads.push({ bucket, storagePath, bytes: buffer.length, contentType })
    },
  })
  assert.equal(path, "characters/2/42/candidates/first.png")
  assert.equal(uploads[0].storagePath, path)
  assert.equal(isCanonicalStoragePath(path), false)
  assert.equal(uploads.some((item) => /canonical\.png$/.test(item.storagePath)), false)
})
