export const dynamic = "force-dynamic"
import { requireAdmin, requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { visualIdentityStatus } from "@/lib/character-identity"
import {
  persistCanonicalReference,
  canonicalReferenceDisplayUrl,
  isDurableReferencePath,
} from "@/lib/character-reference-storage"
import { downloadAsBuffer, IMAGES_BUCKET } from "@/lib/supabase-storage"
import { sniffImageContentType } from "@/lib/image-bytes.js"

async function loadCharacter(charId) {
  return prisma.character.findUnique({
    where: { id: charId },
    select: {
      id: true,
      seriesId: true,
      name: true,
      referenceImageUrl: true,
      referenceEpisode: true,
    },
  })
}

/**
 * GET /api/admin/characters/[id]/reference
 * Serves or redirects the canonical visual identity image.
 */
export async function GET(_request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)
  const character = await loadCharacter(charId)
  if (!character) return Response.json({ error: "Not found" }, { status: 404 })
  if (!character.referenceImageUrl) {
    return Response.json({ error: "Visual identity NOT LOCKED" }, { status: 404 })
  }

  const stored = character.referenceImageUrl
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return Response.redirect(stored, 302)
  }
  if (stored.startsWith("data:")) {
    const match = stored.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) return Response.json({ error: "Invalid stored reference" }, { status: 500 })
    return new Response(Buffer.from(match[2], "base64"), {
      headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=3600" },
    })
  }

  try {
    const buf = await downloadAsBuffer(IMAGES_BUCKET, stored)
    return new Response(buf, {
      headers: {
        "Content-Type": sniffImageContentType(buf),
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    const url = await canonicalReferenceDisplayUrl(stored)
    return Response.redirect(url, 302)
  }
}

/**
 * PUT /api/admin/characters/[id]/reference
 * Copy the still to durable character storage and lock visual identity.
 * Body: { imageUrl: string, episodeNumber: number }
 */
export async function PUT(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)
  const { imageUrl, episodeNumber } = await request.json()

  if (!imageUrl) return Response.json({ error: "imageUrl is required" }, { status: 400 })

  try {
    const character = await loadCharacter(charId)
    if (!character) return Response.json({ error: "Not found" }, { status: 404 })

    let storedPath = imageUrl
    try {
      storedPath = await persistCanonicalReference({
        seriesId: character.seriesId,
        characterId: character.id,
        imageUrl,
      })
    } catch (copyErr) {
      if (isDurableReferencePath(imageUrl)) {
        storedPath = imageUrl
      } else if (imageUrl.startsWith("data:") || imageUrl.startsWith("http")) {
        throw copyErr
      } else {
        throw copyErr
      }
    }

    const updated = await prisma.character.update({
      where: { id: charId },
      data: { referenceImageUrl: storedPath, referenceEpisode: episodeNumber || null },
      select: { id: true, name: true, referenceImageUrl: true, referenceEpisode: true },
    })
    return Response.json({
      ...updated,
      visualIdentity: visualIdentityStatus(updated),
      displayUrl: `/api/admin/characters/${updated.id}/reference`,
    })
  } catch (err) {
    console.error("Set reference error:", err.message)
    return Response.json({ error: "Failed to set reference" }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/characters/[id]/reference
 * Clear the visual reference image for a character.
 */
export async function DELETE(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const charId = Number((await params).id)

  try {
    const updated = await prisma.character.update({
      where: { id: charId },
      data: { referenceImageUrl: null, referenceEpisode: null },
      select: { id: true, name: true, referenceImageUrl: true },
    })
    return Response.json({ ...updated, visualIdentity: visualIdentityStatus(updated) })
  } catch (err) {
    console.error("Clear reference error:", err.message)
    return Response.json({ error: "Failed to clear reference" }, { status: 500 })
  }
}
