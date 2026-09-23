import test from "node:test"
import assert from "node:assert/strict"
import {
  CHARACTER_MASTER_ASPECT,
  CHARACTER_MASTER_MODEL,
  CHARACTER_MASTER_SIZE,
  ELENA_REGEN_APPEARANCE,
  ELENA_LOOK_REF_PRIMARY,
  applyElenaRegenAppearance,
  buildCharacterMasterPrompt,
  characterCandidatePath,
  characterCandidatePrefix,
  characterLookRefPath,
  characterMasterImageSrc,
  elenaMasterGenerateAllowed,
  isApprovedElenaCandidatePath,
  isCanonicalStoragePath,
  isElenaVarelaCharacter,
  matchElenaVarela,
  APPROVED_ELENA_CANDIDATE_PATH,
} from "../../lib/character-master.js"
import { persistCharacterCandidate, approveCanonicalFromCandidate, persistLookReference } from "../../lib/character-reference-storage.js"
import { visualIdentityStatus } from "../../lib/character-identity.js"
import { buildFalStillRequest } from "../../lib/providers/images/still-request.js"

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

test("character master prompt is a portrait and persisted wardrobe beats a black coat", () => {
  const prompt = buildCharacterMasterPrompt(REAL_ELENA, {
    title: "LA ÚLTIMA LLAMADA",
    tone: "cinematic thriller",
    premise: "A last phone call changes everything.",
  })
  assert.match(prompt, /ELENA VARELA — CHARACTER MASTER/)
  assert.match(prompt, /cream knit sweater/)
  assert.match(prompt, /WARDROBE LOCK: cream knit sweater/)
  assert.match(prompt, /No other people/)
  assert.doesNotMatch(prompt, /Mateo/)
  assert.doesNotMatch(prompt, /Iván|Ivan/)
  assert.match(prompt, /Do not show a phone/)
  assert.doesNotMatch(prompt, /preferably a black coat/)
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

test("a second generate is blocked once a candidate exists unless regenerate is authorized", () => {
  const one = [{ path: "characters/2/2/candidates/recov.png" }]
  const two = [
    { path: "characters/2/2/candidates/recov.png" },
    { path: "characters/2/2/candidates/regen.png" },
  ]
  const three = [...two, { path: "characters/2/2/candidates/look2.png" }]
  const four = [...three, { path: "characters/2/2/candidates/look3.png" }]
  assert.equal(elenaMasterGenerateAllowed([]), true)
  assert.equal(elenaMasterGenerateAllowed(one), false)
  assert.equal(elenaMasterGenerateAllowed(one, { regenerate: true }), true)
  assert.equal(elenaMasterGenerateAllowed(two, { regenerate: true }), true)
  assert.equal(elenaMasterGenerateAllowed(two), false)
  assert.equal(elenaMasterGenerateAllowed(three, { regenerate: true }), true)
  assert.equal(elenaMasterGenerateAllowed(four, { regenerate: true }), false)
})

test("authorized regen prompt matches the accepted auburn-red look-ref Elena, not dark studio", () => {
  const character = {
    ...REAL_ELENA,
    appearance: applyElenaRegenAppearance(REAL_ELENA.appearance),
  }
  const prompt = buildCharacterMasterPrompt(character, {
    title: "LA ÚLTIMA LLAMADA",
    tone: "íntimo, tenso, humano",
    premise: "Elena recibe una llamada.",
  })
  assert.match(prompt, /Venezuelan Latina/)
  assert.match(prompt, /green eyes/)
  assert.match(prompt, /auburn-red hair/)
  assert.match(prompt, /fair luminous white-Latina skin/)
  assert.match(prompt, /oval feminine face/)
  assert.match(prompt, /rounded feminine chin|small rounded female chin/)
  assert.match(prompt, /real camera photograph|DSLR photograph/)
  assert.match(prompt, /MUST NOT have a square face/)
  assert.match(prompt, /No crop top/)
  assert.match(prompt, /Not a black studio backdrop/)
  assert.doesNotMatch(prompt, /Emma Watson|Watson/)
  assert.doesNotMatch(prompt, /Mexican woman/)
  assert.doesNotMatch(prompt, /warm medium-brown skin/)
  assert.doesNotMatch(prompt, /blue-night/)
  assert.doesNotMatch(prompt, /Mateo/)
  assert.equal(character.appearance.basePrompt, ELENA_REGEN_APPEARANCE.basePrompt)
  assert.equal(isCanonicalStoragePath("characters/2/2/candidates/regen.png"), false)
  assert.match(characterMasterImageSrc(2, "regen.png"), /master\/image\?v=regen\.png/)
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

test("approve copies the chosen candidate to canonical without deleting it or calling Fal", async () => {
  const downloads = []
  const uploads = []
  let generateCalls = 0
  const approved = APPROVED_ELENA_CANDIDATE_PATH
  assert.equal(isApprovedElenaCandidatePath(approved), true)
  assert.equal(isApprovedElenaCandidatePath("characters/2/2/candidates/6b4cf693-485d-448b-97a3-c9db96fe9756.png"), false)
  assert.equal(isApprovedElenaCandidatePath("characters/2/2/candidates/recovered-01a0cb32-ae19-7541-9457-9a9d3aabce5c.png"), false)
  const result = await approveCanonicalFromCandidate({
    seriesId: 2,
    characterId: 2,
    candidatePath: approved,
    downloadStorage: async (bucket, storagePath) => {
      downloads.push({ bucket, storagePath })
      return Buffer.from("same-bytes")
    },
    uploadFn: async (bucket, storagePath, buffer) => {
      uploads.push({ bucket, storagePath, bytes: buffer.length })
    },
  })
  assert.equal(result.canonicalPath, "characters/2/2/canonical.png")
  assert.equal(result.candidatePath, approved)
  assert.equal(downloads[0].storagePath, approved)
  assert.equal(uploads[0].storagePath, "characters/2/2/canonical.png")
  assert.equal(uploads.some((item) => item.storagePath === approved), false)
  assert.equal(generateCalls, 0)
  assert.equal(visualIdentityStatus({ referenceImageUrl: result.canonicalPath }), "LOCKED")
  assert.equal(visualIdentityStatus({ referenceImageUrl: null }), "NOT LOCKED")
})

test("look-ref candidate persist writes candidates/ from a photo JPEG and never canonical.png or Fal", async () => {
  const uploads = []
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")
  const path = await persistCharacterCandidate({
    seriesId: 2,
    characterId: 2,
    candidateId: "from-model-refs",
    imageUrl: `data:image/jpeg;base64,${jpeg}`,
    uploadFn: async (bucket, storagePath, buffer, contentType) => {
      uploads.push({ bucket, storagePath, bytes: buffer.length, contentType })
    },
  })
  assert.equal(path, "characters/2/2/candidates/from-model-refs.jpg")
  assert.equal(isCanonicalStoragePath(path), false)
  assert.doesNotMatch(path, /look-refs/)
  assert.equal(uploads[0].contentType, "image/jpeg")
  assert.equal(uploads.some((item) => /canonical\.png$/.test(item.storagePath)), false)
})

test("look-reference photos are stored outside candidates and become Fal image_url", async () => {
  const uploads = []
  const path = await persistLookReference({
    seriesId: 2,
    characterId: 2,
    filename: ELENA_LOOK_REF_PRIMARY,
    imageUrl: "data:image/jpeg;base64,aGVsbG8=",
    uploadFn: async (bucket, storagePath) => {
      uploads.push({ bucket, storagePath })
    },
  })
  assert.equal(path, characterLookRefPath(2, 2, ELENA_LOOK_REF_PRIMARY))
  assert.doesNotMatch(path, /candidates/)
  assert.equal(isCanonicalStoragePath(path), false)
  const prompt = buildCharacterMasterPrompt(REAL_ELENA, { title: "LA ÚLTIMA LLAMADA" }, { lookReference: true })
  assert.match(prompt, /LOOK REFERENCE PHOTO/)
  assert.match(prompt, /attached model photograph/)
  assert.match(prompt, /not a celebrity lookalike/)
  const fal = buildFalStillRequest({
    prompt,
    referenceImageUrl: "data:image/jpeg;base64,aaa",
    aspectRatio: "9:16",
    metadata: { strength: 0.42 },
  })
  assert.match(fal.url, /image-to-image/)
  assert.equal(fal.body.image_url, "data:image/jpeg;base64,aaa")
  assert.equal(fal.body.strength, 0.42)
  assert.doesNotMatch(fal.body.image_url, /6b4cf693/)
  assert.equal(uploads[0].storagePath, path)
})
