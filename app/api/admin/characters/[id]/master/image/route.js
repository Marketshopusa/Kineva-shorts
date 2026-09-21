export const dynamic = "force-dynamic"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { listCharacterCandidates } from "@/lib/character-reference-storage.js"
import { downloadAsBuffer, IMAGES_BUCKET } from "@/lib/supabase-storage"

export async function GET(_request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)
  if (!Number.isInteger(charId) || charId <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 })
  }

  const character = await prisma.character.findUnique({ where: { id: charId } })
  if (!character) return Response.json({ error: "Not found" }, { status: 404 })

  const candidates = await listCharacterCandidates(character.seriesId, character.id)
  if (!candidates.length) {
    return Response.json({ error: "No master candidate" }, { status: 404 })
  }

  try {
    const buf = await downloadAsBuffer(IMAGES_BUCKET, candidates[0].path)
    return new Response(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch {
    return Response.json({ error: "Candidate image missing" }, { status: 404 })
  }
}
