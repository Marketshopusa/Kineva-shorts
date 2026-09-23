export const dynamic = "force-dynamic"
export const maxDuration = 60
import { randomUUID } from "node:crypto"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { loadSeriesRail } from "@/lib/series-rail"
import { generateStillForRail } from "@/lib/still-for-rail"
import { getAIConfig } from "@/lib/getAIConfig"
import { jsonRailError } from "@/lib/http-rail-error"
import { assertAdapterMatchesRail } from "@/lib/content-rails"
import { probeFalAccount, requireFalSpendReady } from "@/lib/providers/images/fal.js"
import { findRecentElenaMasterStill } from "@/lib/fal-history.js"
import {
  assertImagesBucketReady,
  ensurePrivateImagesBucket,
  inspectImagesStorage,
} from "@/lib/storage-preflight.js"
import {
  CHARACTER_MASTER_ASPECT,
  CHARACTER_MASTER_MODEL,
  CHARACTER_MASTER_SIZE,
  ELENA_SERIES_ID,
  applyElenaRegenAppearance,
  buildCharacterMasterPrompt,
  elenaMasterGenerateAllowed,
  isCanonicalStoragePath,
} from "@/lib/character-master.js"
import { approveCanonicalFromCandidate, persistCharacterCandidate } from "@/lib/character-reference-storage.js"
import { loadElenaMasterPayload, resolveElenaVarelaFromDb } from "@/lib/elena-varela-master-server.js"

const CONFIRMED_ELENA_ID = 2

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

async function resolveConfirmedElena() {
  const character = await resolveElenaVarelaFromDb()
  if (!character) return null
  if (Number(character.id) !== CONFIRMED_ELENA_ID || Number(character.seriesId) !== ELENA_SERIES_ID) {
    return null
  }
  return character
}

async function storageReport() {
  try {
    return await inspectImagesStorage()
  } catch (err) {
    return {
      buckets: [],
      imagesBucket: "images",
      action: "UNKNOWN",
      private: null,
      ready: false,
      error: String(err?.message || err),
    }
  }
}

export async function GET() {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const character = await resolveConfirmedElena()
  if (!character) {
    return Response.json({ error: "Elena Varela not found in Series/2 as Character #2" }, { status: 404 })
  }

  let fal = { status: "UNKNOWN", remainingUsd: null, keyMatch: "UNKNOWN", generateLocked: false }
  try {
    fal = falBalanceReport(await probeFalAccount())
  } catch (err) {
    const msg = String(err?.message || err)
    fal = {
      status: /TOP_UP/i.test(msg) ? "TOP_UP_REQUIRED" : "UNKNOWN",
      remainingUsd: null,
      keyMatch: /TOP_UP/i.test(msg) ? "NO" : "UNKNOWN",
      generateLocked: /TOP_UP/i.test(msg),
    }
  }

  const storage = await storageReport()
  let recovery = { recoverable: false, reason: "not inspected", requestId: null }
  try {
    const found = await findRecentElenaMasterStill()
    recovery = {
      recoverable: !!found.recoverable,
      reason: found.reason || null,
      requestId: found.requestId || null,
    }
  } catch (err) {
    recovery = { recoverable: false, reason: String(err?.message || err), requestId: null }
  }

  const payload = await loadElenaMasterPayload(character)
  return Response.json({
    elenaCharacterId: character.id,
    ...payload,
    fal,
    falKeyMatch: fal.keyMatch,
    generateCalls: 0,
    elenaMaster: payload.candidates.length ? "CANDIDATE" : "PENDING_GENERATE",
    visualIdentity: payload.character.visualIdentity,
    pendingApproval: payload.pendingApproval,
    storage,
    previousFalImage: recovery,
    ...masterConstants(),
  })
}

async function recoverElenaMaster(character) {
  const existing = await loadElenaMasterPayload(character)
  if (!elenaMasterGenerateAllowed(existing.candidates)) {
    return Response.json({
      error: "Elena master candidate already exists; waiting for human approval",
      elenaCharacterId: character.id,
      ...existing,
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
      elenaMaster: "CANDIDATE",
      visualIdentity: existing.character.visualIdentity,
      pendingApproval: true,
      ...masterConstants(),
    }, { status: 409 })
  }

  const storage = await ensurePrivateImagesBucket()
  const found = await findRecentElenaMasterStill()
  if (!found.recoverable || !found.imageUrl) {
    return Response.json({
      elenaCharacterId: character.id,
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
      previousFalImageRecoverable: false,
      reason: found.reason || "original Fal still not found",
      storage,
      elenaMaster: "FAIL",
      visualIdentity: existing.character.visualIdentity,
      pendingApproval: false,
      ...masterConstants(),
    })
  }

  const candidateId = `recovered-${String(found.requestId || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || randomUUID()}`
  let storagePath
  try {
    storagePath = await persistCharacterCandidate({
      seriesId: character.seriesId,
      characterId: character.id,
      imageUrl: found.imageUrl,
      candidateId,
    })
  } catch (err) {
    const msg = String(err?.message || err)
    if (/Failed to fetch reference image/i.test(msg)) {
      return Response.json({
        elenaCharacterId: character.id,
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        previousFalImageRecoverable: false,
        reason: "original Fal URL expired or unreachable",
        storage,
        elenaMaster: "FAIL",
        visualIdentity: existing.character.visualIdentity,
        pendingApproval: false,
        ...masterConstants(),
      })
    }
    throw err
  }
  if (isCanonicalStoragePath(storagePath)) {
    throw new Error("refused to persist Elena master as canonical.png")
  }

  const fresh = await prisma.character.findUnique({ where: { id: character.id } })
  const payload = await loadElenaMasterPayload(fresh)
  return Response.json({
    elenaCharacterId: character.id,
    ...payload,
    generateCalls: 0,
    falGenerateCallsThisStep: 0,
    previousFalImageRecoverable: true,
    elenaMaster: payload.candidates.length ? "PASS" : "FAIL",
    storage,
    storagePath,
    visualIdentity: payload.character.visualIdentity,
    pendingApproval: payload.pendingApproval,
    requestId: found.requestId,
    ...masterConstants(),
  })
}

async function approveElenaCanonical(character, candidatePath) {
  const existing = await loadElenaMasterPayload(character)
  const requested = String(candidatePath || existing.candidates[0]?.path || "")
  if (!existing.candidates.some((item) => item.path === requested)) {
    return Response.json({
      error: "Elena candidate is not in storage",
      elenaCharacterId: character.id,
      generateCalls: 0,
      falGenerateCallsThisStep: 0,
      elenaMaster: "FAIL",
      visualIdentity: existing.character.visualIdentity,
      ...masterConstants(),
    }, { status: 404 })
  }

  const { canonicalPath } = await approveCanonicalFromCandidate({
    seriesId: character.seriesId,
    characterId: character.id,
    candidatePath: requested,
  })

  const fresh = await prisma.character.update({
    where: { id: character.id },
    data: { referenceImageUrl: canonicalPath, referenceEpisode: null },
  })
  const payload = await loadElenaMasterPayload(fresh)
  const preserved = payload.candidates.some((item) => item.path === requested)
  return Response.json({
    elenaCharacterId: character.id,
    ...payload,
    generateCalls: 0,
    falGenerateCallsThisStep: 0,
    elenaMaster: payload.character.visualIdentity === "LOCKED" && preserved ? "PASS" : "FAIL",
    storagePath: canonicalPath,
    canonicalPath,
    candidatePreserved: preserved,
    visualIdentity: payload.character.visualIdentity,
    pendingApproval: payload.pendingApproval,
    ...masterConstants(),
  })
}

export async function POST(request) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const character = await resolveConfirmedElena()
  if (!character) {
    return Response.json({ error: "Elena Varela not found in Series/2 as Character #2" }, { status: 404 })
  }

  if (body.approve === true) {
    if (body.generate === true) {
      return Response.json({
        error: "Approve does not generate",
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        elenaMaster: "FAIL",
      }, { status: 400 })
    }
    try {
      return await approveElenaCanonical(character, body.candidatePath)
    } catch (err) {
      return jsonRailError(err) || Response.json({
        error: err.message || "Elena approve failed",
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        elenaMaster: "FAIL",
      }, { status: 500 })
    }
  }

  if (body.generate !== true) {
    try {
      return await recoverElenaMaster(character)
    } catch (err) {
      return jsonRailError(err) || Response.json({
        error: err.message || "Elena recover failed",
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        elenaMaster: "FAIL",
      }, { status: 500 })
    }
  }

  let generateCalls = 0
  try {
    const existing = await loadElenaMasterPayload(character)
    const regenerate = body.regenerate === true
    if (!elenaMasterGenerateAllowed(existing.candidates, { regenerate })) {
      return Response.json({
        error: regenerate
          ? "Elena master regenerate already used; waiting for human approval"
          : "Elena master candidate already exists; waiting for human approval",
        elenaCharacterId: character.id,
        ...existing,
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        elenaMaster: "CANDIDATE",
        visualIdentity: existing.character.visualIdentity,
        ...masterConstants(),
      }, { status: 409 })
    }

    await assertImagesBucketReady()

    const probe = await probeFalAccount()
    const fal = falBalanceReport(probe)
    if (probe.generateLocked || (probe.remainingUsd != null && probe.remainingUsd <= 0)) {
      return Response.json({
        error: "BLOCKED_BALANCE (image): FAL_TOP_UP_REQUIRED",
        elenaCharacterId: character.id,
        fal,
        falKeyMatch: "NO",
        generateCalls: 0,
        falGenerateCallsThisStep: 0,
        elenaMaster: "FAIL",
        visualIdentity: existing.character.visualIdentity,
        ...masterConstants(),
      }, { status: 402 })
    }
    requireFalSpendReady(probe)

    const series = await prisma.series.findUnique({ where: { id: character.seriesId } })
    const { rail } = await loadSeriesRail(character.seriesId)
    assertAdapterMatchesRail(rail, "image", "fal")
    const config = await getAIConfig()
    const promptCharacter = regenerate
      ? { ...character, appearance: applyElenaRegenAppearance(character.appearance) }
      : character
    const prompt = buildCharacterMasterPrompt(promptCharacter, series)
    generateCalls = 1
    const { dataUrl, provider } = await generateStillForRail(
      rail,
      {
        prompt,
        referenceImageUrl: null,
        aspectRatio: CHARACTER_MASTER_ASPECT,
        metadata: { kind: "character-master", characterId: character.id, seriesId: character.seriesId },
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
      throw new Error("refused to persist Elena master as canonical.png")
    }

    let fresh = await prisma.character.findUnique({ where: { id: character.id } })
    if (regenerate) {
      fresh = await prisma.character.update({
        where: { id: character.id },
        data: {
          appearance: applyElenaRegenAppearance(character.appearance),
          referenceImageUrl: null,
          referenceEpisode: null,
        },
      })
    }
    const payload = await loadElenaMasterPayload(fresh)
    return Response.json({
      elenaCharacterId: character.id,
      ...payload,
      generateCalls: 1,
      falGenerateCallsThisStep: 1,
      elenaMaster: "PASS",
      provider,
      fal: falBalanceReport(probe),
      falKeyMatch: "YES",
      storagePath,
      visualIdentity: payload.character.visualIdentity,
      pendingApproval: payload.pendingApproval,
      previousCandidateKept: regenerate ? existing.candidates.length > 0 : false,
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
        elenaMaster: "FAIL",
        falKeyMatch: /TOP_UP/i.test(msg) ? "NO" : "UNKNOWN",
        visualIdentity: "NOT LOCKED",
      }, { status: rail.status })
    }
    return Response.json({
      error: err.message || "Elena master failed",
      generateCalls,
      falGenerateCallsThisStep: generateCalls,
      elenaMaster: "FAIL",
    }, { status: 500 })
  }
}
