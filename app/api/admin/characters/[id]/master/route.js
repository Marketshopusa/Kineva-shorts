export const dynamic = "force-dynamic"
export const maxDuration = 60
import { randomUUID } from "node:crypto"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { visualIdentityStatus } from "@/lib/character-identity"
import { withCandidateDisplayUrls } from "@/lib/elena-varela-master-server.js"
import { listCharacterCandidates, persistCharacterCandidate } from "@/lib/character-reference-storage.js"
import { loadSeriesRail } from "@/lib/series-rail"
import { generateStillForRail } from "@/lib/still-for-rail"
import { getAIConfig } from "@/lib/getAIConfig"
import { jsonRailError } from "@/lib/http-rail-error"
import { assertAdapterMatchesRail } from "@/lib/content-rails"
import { probeFalAccount, requireFalSpendReady } from "@/lib/providers/images/fal.js"
import { assertImagesBucketReady } from "@/lib/storage-preflight.js"
import {
  CHARACTER_MASTER_ASPECT,
  CHARACTER_MASTER_MODEL,
  CHARACTER_MASTER_SIZE,
  buildIvanCruzMasterPrompt,
  characterMasterGenerateAllowed,
  isCanonicalStoragePath,
  isElenaVarelaCharacter,
  isIvanCruzCharacter,
} from "@/lib/character-master.js"

function falBalanceReport(balance) {
  if (!balance?.ok) {
    return {
      status: "UNKNOWN",
      remainingUsd: null,
      detail: balance?.detail || null,
      keyMatch: balance?.keyMatch || "UNKNOWN",
      generateLocked: !!balance?.generateLocked,
      username: balance?.username || null,
    }
  }
  if (balance.remainingUsd != null && balance.remainingUsd <= 0) {
    return {
      status: "TOP_UP_REQUIRED",
      remainingUsd: balance.remainingUsd,
      detail: balance.detail || null,
      keyMatch: "NO",
      generateLocked: true,
      username: balance.username || null,
    }
  }
  return {
    status: balance.generateLocked ? "TOP_UP_REQUIRED" : "AVAILABLE",
    remainingUsd: balance.remainingUsd ?? null,
    detail: balance.probeDetail || balance.detail || null,
    keyMatch: balance.keyMatch || "UNKNOWN",
    generateLocked: !!balance.generateLocked,
    username: balance.username || null,
  }
}

function masterConstants() {
  return {
    model: CHARACTER_MASTER_MODEL,
    resolution: `${CHARACTER_MASTER_SIZE.width}x${CHARACTER_MASTER_SIZE.height}`,
    aspectRatio: CHARACTER_MASTER_ASPECT,
  }
}

export async function GET(_request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)
  if (!Number.isInteger(charId) || charId <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 })
  }

  const character = await prisma.character.findUnique({ where: { id: charId } })
  if (!character) return Response.json({ error: "Not found" }, { status: 404 })

  const candidates = await withCandidateDisplayUrls(
    await listCharacterCandidates(character.seriesId, character.id),
  )
  return Response.json({
    id: character.id,
    seriesId: character.seriesId,
    name: character.name,
    role: character.role,
    appearance: character.appearance || null,
    personality: character.personality || null,
    visualIdentity: visualIdentityStatus(character),
    pendingApproval: !character.referenceImageUrl && candidates.length > 0,
    candidates,
    referenceImageUrl: character.referenceImageUrl ? "SET" : "EMPTY",
    ...masterConstants(),
  })
}

export async function POST(request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)
  if (!Number.isInteger(charId) || charId <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 })
  }

  let body = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const character = await prisma.character.findUnique({ where: { id: charId } })
  if (!character) return Response.json({ error: "Not found" }, { status: 404 })

  if (body.generate !== true) {
    return GET(request, { params: Promise.resolve({ id: String(charId) }) })
  }

  if (body.approve === true) {
    return Response.json({
      error: "This route does not approve or lock a canonical",
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
    }, { status: 400 })
  }

  if (isElenaVarelaCharacter(character)) {
    return Response.json({
      error: "Elena Varela master generate stays on /api/admin/characters/elena-varela",
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
    }, { status: 409 })
  }

  if (normalizeMateo(character)) {
    return Response.json({
      error: "Mateo Varela is voice-only for this phase; no Character Master generate",
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
    }, { status: 409 })
  }

  if (!isIvanCruzCharacter(character) || Number(character.id) !== 4) {
    return Response.json({
      error: "This generate path is only for Iván Cruz Character #4",
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
    }, { status: 409 })
  }

  if (character.referenceImageUrl) {
    return Response.json({
      error: "Iván Cruz is already LOCKED; refusing a new master generate",
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
      visualIdentity: "LOCKED",
    }, { status: 409 })
  }

  let generateCalls = 0
  try {
    const candidates = await listCharacterCandidates(character.seriesId, character.id)
    if (!characterMasterGenerateAllowed(candidates, { regenerate: false })) {
      return Response.json({
        error: "Iván master candidate already exists; waiting for human approval",
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        visualIdentity: visualIdentityStatus(character),
        pendingApproval: true,
        candidates,
        ...masterConstants(),
      }, { status: 409 })
    }

    await assertImagesBucketReady()

    const probe = await probeFalAccount()
    const fal = falBalanceReport(probe)
    if (probe.generateLocked || (probe.remainingUsd != null && probe.remainingUsd <= 0)) {
      return Response.json({
        error: "BLOCKED_BALANCE (image): FAL_TOP_UP_REQUIRED",
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        fal,
        visualIdentity: visualIdentityStatus(character),
        ...masterConstants(),
      }, { status: 402 })
    }
    requireFalSpendReady(probe)

    const series = await prisma.series.findUnique({ where: { id: character.seriesId } })
    const { rail } = await loadSeriesRail(character.seriesId)
    assertAdapterMatchesRail(rail, "image", "fal")
    const config = await getAIConfig()
    const prompt = buildIvanCruzMasterPrompt(character, series)

    generateCalls = 1
    const { dataUrl, provider } = await generateStillForRail(
      rail,
      {
        prompt,
        aspectRatio: CHARACTER_MASTER_ASPECT,
        metadata: {
          kind: "character-master",
          characterId: character.id,
          seriesId: character.seriesId,
        },
      },
      config,
    )

    const candidateId = randomUUID()
    const storagePath = await persistCharacterCandidate({
      seriesId: character.seriesId,
      characterId: character.id,
      imageUrl: dataUrl,
      candidateId,
    })
    if (isCanonicalStoragePath(storagePath)) {
      throw new Error("refused to persist Iván master as canonical")
    }

    const fresh = await prisma.character.findUnique({ where: { id: character.id } })
    const listed = await withCandidateDisplayUrls(
      await listCharacterCandidates(fresh.seriesId, fresh.id),
    )
    if (fresh.referenceImageUrl) {
      throw new Error("refused: generate must not set referenceImageUrl")
    }
    return Response.json({
      id: fresh.id,
      seriesId: fresh.seriesId,
      name: fresh.name,
      generateCalls: 1,
      falGenerateCallsThisStep: 1,
      ivanMaster: "PASS",
      provider,
      fal,
      storagePath,
      visualIdentity: visualIdentityStatus(fresh),
      pendingApproval: !fresh.referenceImageUrl && listed.length > 0,
      candidates: listed,
      referenceImageUrl: fresh.referenceImageUrl ? "SET" : "EMPTY",
      appearanceUnchanged: JSON.stringify(fresh.appearance) === JSON.stringify(character.appearance),
      canonicalCreated: false,
      ...masterConstants(),
    })
  } catch (err) {
    const rail = jsonRailError(err)
    if (rail) {
      const msg = String(err.message || err)
      return Response.json({
        error: msg,
        generateCalls,
        falGenerateCallsThisStep: generateCalls,
        ivanMaster: "FAIL",
        visualIdentity: visualIdentityStatus(character),
      }, { status: rail.status })
    }
    return Response.json({
      error: err.message || "Iván master failed",
      generateCalls,
      falGenerateCallsThisStep: generateCalls,
      ivanMaster: "FAIL",
    }, { status: 500 })
  }
}

function normalizeMateo(character) {
  return /\bmateo\b/i.test(String(character?.name || ""))
}
