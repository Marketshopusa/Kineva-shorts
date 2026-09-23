import test from "node:test"
import assert from "node:assert/strict"
import {
  CHARACTER_MASTER_ASPECT,
  CHARACTER_MASTER_MODEL,
  CHARACTER_MASTER_SIZE,
  APPROVED_IVAN_CANDIDATE_PATH,
  candidateExtensionFromContentType,
  buildIvanCruzMasterPrompt,
  characterCandidatePath,
  characterMasterGenerateAllowed,
  isApprovedIvanCandidatePath,
  isCanonicalStoragePath,
  isIvanCruzCharacter,
} from "../../lib/character-master.js"
import { approveCanonicalFromCandidate, persistCharacterCandidate } from "../../lib/character-reference-storage.js"
import { resolveCharacterReferenceForProvider } from "../../lib/character-reference-provider.js"
import { visualIdentityStatus } from "../../lib/character-identity.js"
import { sniffImageContentType } from "../../lib/image-bytes.js"

const IVAN = {
  id: 4,
  seriesId: 2,
  name: "Iván Cruz",
  role: "supporting",
  appearance: {
    basePrompt: "Iván Cruz, Mexican man about 34, short cropped black hair, neatly trimmed beard, medium-brown skin, calm heavy-lidded eyes, solid build, photorealistic adult, no text in image",
    wardrobeDefault: "Dark hoodie and a building-maintenance lanyard",
    distinguishingFeatures: "A small silver stud in the left ear",
  },
  personality: {
    traits: ["discreto", "constante"],
    backstory: "Vecino del quinto. Encontró a Elena en el pasillo más de una noche.",
    speechPattern: "Pregunta poco; ofrece café y silencio.",
  },
  referenceImageUrl: null,
}

const SERIES = {
  id: 2,
  title: "LA ÚLTIMA LLAMADA",
  tone: "íntimo, tenso, humano",
  premise: "Elena recibe una llamada de voz de su hermano desaparecido. El mensaje fue programado hace tres años.",
}

test("Iván Cruz matches series 2 by name, not Elena or Mateo", () => {
  assert.equal(isIvanCruzCharacter(IVAN), true)
  assert.equal(isIvanCruzCharacter({ id: 2, seriesId: 2, name: "Elena Varela", role: "protagonist" }), false)
  assert.equal(isIvanCruzCharacter({ id: 3, seriesId: 2, name: "Mateo Varela", role: "supporting" }), false)
})

test("Iván master prompt uses persisted appearance and does not copy Elena", () => {
  const prompt = buildIvanCruzMasterPrompt(IVAN, SERIES)
  assert.match(prompt, /IVÁN CRUZ — CHARACTER MASTER/)
  assert.match(prompt, /Mexican man about 34/)
  assert.match(prompt, /short cropped black hair/)
  assert.match(prompt, /neatly trimmed beard/)
  assert.match(prompt, /medium-brown skin/)
  assert.match(prompt, /heavy-lidded eyes/)
  assert.match(prompt, /solid build/)
  assert.match(prompt, /Dark hoodie and a building-maintenance lanyard/)
  assert.match(prompt, /silver stud in the left ear/)
  assert.match(prompt, /discreto/)
  assert.match(prompt, /LA ÚLTIMA LLAMADA/)
  assert.match(prompt, /CHARACTER MASTER, not an Episode 1 scene/)
  const persistedBlock = prompt.split("Style brief")[0]
  assert.doesNotMatch(persistedBlock, /green eyes/)
  assert.doesNotMatch(persistedBlock, /auburn-red/)
  assert.doesNotMatch(persistedBlock, /cream knit sweater|ivory knit/)
  assert.match(prompt, /not green eyes/)
  assert.match(prompt, /not auburn-red hair/)
  assert.doesNotMatch(prompt, /Mateo Varela, Mexican man about 26/)
  assert.doesNotMatch(prompt, /Do not show a phone, a second person, episode action/)
  assert.equal(CHARACTER_MASTER_ASPECT, "9:16")
  assert.deepEqual(CHARACTER_MASTER_SIZE, { width: 1080, height: 1920 })
  assert.equal(CHARACTER_MASTER_MODEL, "fal-ai/flux/dev")
})

test("Iván candidate persist writes candidates/ with matching bytes extension and never canonical or lock", async () => {
  const uploads = []
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  const path = await persistCharacterCandidate({
    seriesId: 2,
    characterId: 4,
    candidateId: "ivan-one",
    imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    uploadFn: async (bucket, storagePath, buffer, contentType) => {
      uploads.push({ bucket, storagePath, bytes: buffer.length, contentType })
    },
  })
  assert.equal(path, characterCandidatePath(2, 4, "ivan-one", "jpg"))
  assert.equal(path, "characters/2/4/candidates/ivan-one.jpg")
  assert.equal(isCanonicalStoragePath(path), false)
  assert.doesNotMatch(path, /canonical/)
  assert.equal(uploads[0].contentType, "image/jpeg")
  assert.equal(sniffImageContentType(jpeg), "image/jpeg")
  assert.equal(candidateExtensionFromContentType("image/jpeg"), "jpg")
  assert.equal(visualIdentityStatus({ referenceImageUrl: null }), "NOT LOCKED")
})

test("a second Iván generate is blocked once a candidate exists", () => {
  const one = [{ path: "characters/2/4/candidates/ivan-one.jpg" }]
  assert.equal(characterMasterGenerateAllowed([]), true)
  assert.equal(characterMasterGenerateAllowed(one), false)
  assert.equal(characterMasterGenerateAllowed(one, { regenerate: false }), false)
})

test("approve copies the JPEG candidate to canonical.jpg, keeps the candidate, and does not call Fal", async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  const downloads = []
  const uploads = []
  let generateCalls = 0
  assert.equal(isApprovedIvanCandidatePath(APPROVED_IVAN_CANDIDATE_PATH), true)
  const result = await approveCanonicalFromCandidate({
    seriesId: 2,
    characterId: 4,
    candidatePath: APPROVED_IVAN_CANDIDATE_PATH,
    downloadStorage: async (bucket, storagePath) => {
      downloads.push({ bucket, storagePath })
      return jpeg
    },
    uploadFn: async (bucket, storagePath, buffer, contentType) => {
      uploads.push({ bucket, storagePath, bytes: buffer.length, contentType })
    },
  })
  assert.equal(result.canonicalPath, "characters/2/4/canonical.jpg")
  assert.equal(result.candidatePath, APPROVED_IVAN_CANDIDATE_PATH)
  assert.equal(downloads[0].storagePath, APPROVED_IVAN_CANDIDATE_PATH)
  assert.equal(uploads[0].storagePath, "characters/2/4/canonical.jpg")
  assert.equal(uploads[0].contentType, "image/jpeg")
  assert.equal(uploads.some((item) => item.storagePath === APPROVED_IVAN_CANDIDATE_PATH), false)
  assert.equal(isCanonicalStoragePath(result.canonicalPath), true)
  assert.equal(generateCalls, 0)
  assert.equal(visualIdentityStatus({ referenceImageUrl: result.canonicalPath }), "LOCKED")
})

test("signed provider URL is not persisted as Iván canonical", async () => {
  const character = {
    id: 4,
    name: "Iván Cruz",
    referenceImageUrl: "characters/2/4/canonical.jpg",
  }
  const original = character.referenceImageUrl
  const resolved = await resolveCharacterReferenceForProvider(character, {
    downloadStorage: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    signUrl: async () => "https://signed.example/images/characters/2/4/canonical.jpg?token=tmp",
  })
  assert.equal(character.referenceImageUrl, original)
  assert.equal(character.referenceImageUrl, "characters/2/4/canonical.jpg")
  assert.match(resolved.providerUrl, /^https:\/\//)
  assert.notEqual(resolved.providerUrl, character.referenceImageUrl)
  assert.equal(resolved.durablePath, "characters/2/4/canonical.jpg")
})
