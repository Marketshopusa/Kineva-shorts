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
import {
  CHARACTER_MASTER_ASPECT,
  CHARACTER_MASTER_MODEL,
  CHARACTER_MASTER_SIZE,
  ELENA_SERIES_ID,
  buildCharacterMasterPrompt,
  elenaMasterGenerateAllowed,
  isCanonicalStoragePath,
} from "@/lib/character-master.js"
import { persistCharacterCandidate } from "@/lib/character-reference-storage.js"
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

  const payload = await loadElenaMasterPayload(character)
  return Response.json({
    elenaCharacterId: character.id,
    ...payload,
    fal,
    falKeyMatch: fal.keyMatch,
    generateCalls: 0,
    elenaMaster: payload.candidates.length ? "CANDIDATE" : "PENDING_GENERATE",
    visualIdentity: payload.character.visualIdentity,
    ...masterConstants(),
  })
}

export async function POST() {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let generateCalls = 0
  try {
    const character = await resolveConfirmedElena()
    if (!character) {
      return Response.json({ error: "Elena Varela not found in Series/2 as Character #2" }, { status: 404 })
    }

    const existing = await loadElenaMasterPayload(character)
    if (!elenaMasterGenerateAllowed(existing.candidates)) {
      return Response.json({
        error: "Elena master candidate already exists; waiting for human approval",
        elenaCharacterId: character.id,
        ...existing,
        generateCalls: 0,
        elenaMaster: "CANDIDATE",
        visualIdentity: existing.character.visualIdentity,
        ...masterConstants(),
      }, { status: 409 })
    }

    const probe = await probeFalAccount()
    const fal = falBalanceReport(probe)
    if (probe.generateLocked || (probe.remainingUsd != null && probe.remainingUsd <= 0)) {
      return Response.json({
        error: "BLOCKED_BALANCE (image): FAL_TOP_UP_REQUIRED",
        elenaCharacterId: character.id,
        fal,
        falKeyMatch: "NO",
        generateCalls: 0,
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
    const prompt = buildCharacterMasterPrompt(character, series)
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

    let probeAfter = null
    try {
      probeAfter = await probeFalAccount()
    } catch {
      probeAfter = null
    }
    const costUsd =
      probe.remainingUsd != null && probeAfter?.remainingUsd != null
        ? Number((probe.remainingUsd - probeAfter.remainingUsd).toFixed(6))
        : null

    const fresh = await prisma.character.findUnique({ where: { id: character.id } })
    const payload = await loadElenaMasterPayload(fresh)
    return Response.json({
      elenaCharacterId: character.id,
      ...payload,
      generateCalls: 1,
      elenaMaster: "PASS",
      provider,
      fal: falBalanceReport(probeAfter || probe),
      falKeyMatch: "YES",
      costUsd,
      storagePath,
      visualIdentity: payload.character.visualIdentity,
      ...masterConstants(),
    })
  } catch (err) {
    const rail = jsonRailError(err)
    if (rail) {
      const msg = String(err.message || err)
      return Response.json({
        error: msg,
        generateCalls,
        elenaMaster: "FAIL",
        falKeyMatch: /TOP_UP/i.test(msg) ? "NO" : "UNKNOWN",
        visualIdentity: "NOT LOCKED",
      }, { status: rail.status })
    }
    return Response.json({ error: err.message || "Elena master failed", generateCalls, elenaMaster: "FAIL" }, { status: 500 })
  }
}
