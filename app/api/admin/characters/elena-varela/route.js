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
import { checkFalBalance, requireFalSpendReady } from "@/lib/providers/images/fal.js"
import {
  CHARACTER_MASTER_ASPECT,
  CHARACTER_MASTER_MODEL,
  CHARACTER_MASTER_SIZE,
  buildCharacterMasterPrompt,
  elenaMasterGenerateAllowed,
  isCanonicalStoragePath,
} from "@/lib/character-master.js"
import { persistCharacterCandidate } from "@/lib/character-reference-storage.js"
import { loadElenaMasterPayload, resolveElenaVarelaFromDb } from "@/lib/elena-varela-master-server.js"

function falBalanceReport(balance) {
  if (!balance?.ok) return { status: "UNKNOWN", remainingUsd: null, detail: balance?.detail || null }
  if (balance.remainingUsd != null && balance.remainingUsd <= 0) {
    return { status: "TOP_UP_REQUIRED", remainingUsd: balance.remainingUsd, detail: balance.detail || null }
  }
  return {
    status: "AVAILABLE",
    remainingUsd: balance.remainingUsd ?? null,
    detail: balance.detail || null,
  }
}

function masterConstants() {
  return {
    model: CHARACTER_MASTER_MODEL,
    resolution: `${CHARACTER_MASTER_SIZE.width}x${CHARACTER_MASTER_SIZE.height}`,
    aspectRatio: CHARACTER_MASTER_ASPECT,
  }
}

export async function GET() {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const character = await resolveElenaVarelaFromDb()
  if (!character) {
    return Response.json({ error: "Elena Varela not found in Series/2" }, { status: 404 })
  }

  let fal = { status: "UNKNOWN", remainingUsd: null }
  try {
    fal = falBalanceReport(await checkFalBalance())
  } catch (err) {
    const msg = String(err?.message || err)
    fal = {
      status: /TOP_UP/i.test(msg) ? "TOP_UP_REQUIRED" : "UNKNOWN",
      remainingUsd: null,
    }
  }

  const payload = await loadElenaMasterPayload(character)
  return Response.json({
    elenaCharacterId: character.id,
    ...payload,
    fal,
    generateCalls: 0,
    elenaMaster: payload.candidates.length ? "CANDIDATE" : "PENDING_GENERATE",
    visualIdentity: payload.character.visualIdentity,
    ...masterConstants(),
  })
}

export async function POST() {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const character = await resolveElenaVarelaFromDb()
    if (!character) {
      return Response.json({ error: "Elena Varela not found in Series/2" }, { status: 404 })
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

    const balanceBefore = await checkFalBalance()
    requireFalSpendReady(balanceBefore)

    const series = await prisma.series.findUnique({ where: { id: character.seriesId } })
    const { rail } = await loadSeriesRail(character.seriesId)
    assertAdapterMatchesRail(rail, "image", "fal")
    const config = await getAIConfig()
    const prompt = buildCharacterMasterPrompt(character, series)
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

    let balanceAfter = null
    try {
      balanceAfter = await checkFalBalance()
    } catch {
      balanceAfter = null
    }
    const costUsd =
      balanceBefore.remainingUsd != null && balanceAfter?.remainingUsd != null
        ? Number((balanceBefore.remainingUsd - balanceAfter.remainingUsd).toFixed(6))
        : null

    const fresh = await prisma.character.findUnique({ where: { id: character.id } })
    const payload = await loadElenaMasterPayload(fresh)
    return Response.json({
      elenaCharacterId: character.id,
      ...payload,
      generateCalls: 1,
      elenaMaster: "PASS",
      provider,
      fal: falBalanceReport(balanceAfter || balanceBefore),
      costUsd,
      storagePath,
      visualIdentity: payload.character.visualIdentity,
      ...masterConstants(),
    })
  } catch (err) {
    return jsonRailError(err) || Response.json({ error: err.message || "Elena master failed" }, { status: 500 })
  }
}
