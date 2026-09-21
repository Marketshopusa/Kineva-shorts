export const dynamic = "force-dynamic"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { visualIdentityStatus } from "@/lib/character-identity"
import { withCandidateDisplayUrls } from "@/lib/elena-varela-master-server.js"
import { listCharacterCandidates } from "@/lib/character-reference-storage.js"

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
    name: character.name,
    visualIdentity: visualIdentityStatus(character),
    pendingApproval: !character.referenceImageUrl && candidates.length > 0,
    candidates,
  })
}
