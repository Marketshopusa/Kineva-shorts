import prisma from "@/lib/prisma"
import { visualIdentityStatus } from "@/lib/character-identity"
import { matchElenaVarela, characterMasterImageSrc } from "@/lib/character-master.js"
import {
  canonicalReferenceDisplayUrl,
  listCharacterCandidates,
} from "@/lib/character-reference-storage.js"

function appearanceSummary(appearance) {
  const value = appearance && typeof appearance === "object" ? appearance : {}
  return {
    basePrompt: value.basePrompt || "",
    wardrobeDefault: value.wardrobeDefault || "",
    distinguishingFeatures: value.distinguishingFeatures || "",
  }
}

export async function withCandidateDisplayUrls(candidates) {
  const out = []
  for (const item of candidates) {
    let displayUrl = null
    try {
      displayUrl = await canonicalReferenceDisplayUrl(item.path)
    } catch {
      displayUrl = null
    }
    out.push({ ...item, displayUrl })
  }
  return out
}

export async function resolveElenaVarelaFromDb() {
  const characters = await prisma.character.findMany({ where: { seriesId: 2 } })
  return matchElenaVarela(characters)
}

export async function masterCandidateFields(character) {
  try {
    const candidates = await listCharacterCandidates(character.seriesId, character.id)
    const pendingMasterApproval = !character.referenceImageUrl && candidates.length > 0
    return {
      pendingMasterApproval,
      masterCandidatePath: candidates[0]?.path || null,
      masterCandidateImageSrc: pendingMasterApproval ? characterMasterImageSrc(character.id) : null,
    }
  } catch {
    return { pendingMasterApproval: false, masterCandidatePath: null }
  }
}

export async function loadElenaMasterPayload(character) {
  const series = await prisma.series.findUnique({ where: { id: character.seriesId } })
  const candidates = await withCandidateDisplayUrls(
    await listCharacterCandidates(character.seriesId, character.id),
  )
  return {
    character: {
      id: character.id,
      seriesId: character.seriesId,
      name: character.name,
      role: character.role,
      referenceImageUrl: character.referenceImageUrl ? "SET" : "EMPTY",
      referenceEpisode: character.referenceEpisode || null,
      visualIdentity: visualIdentityStatus(character),
      appearance: appearanceSummary(character.appearance),
    },
    series: series
      ? {
          id: series.id,
          title: series.title,
          tone: series.tone || null,
          premise: series.premise || null,
        }
      : null,
    candidates,
    pendingApproval: !character.referenceImageUrl && candidates.length > 0,
  }
}
