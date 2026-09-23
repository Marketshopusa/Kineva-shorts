export const dynamic = "force-dynamic"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { uploadBuffer, createSignedUploadUrl, RENDERS_BUCKET, renderPath } from "@/lib/supabase-storage"

export async function POST(request, { params }) {
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (Number.isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
  if (!episode) return Response.json({ error: "Not found" }, { status: 404 })

  const storagePath = renderPath(episode.seriesId, episode.id)
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}))
    if (body.signedUpload === true) {
      const signed = await createSignedUploadUrl(RENDERS_BUCKET, storagePath, { upsert: true })
      return Response.json({
        bucket: RENDERS_BUCKET,
        path: storagePath,
        signedUrl: signed.signedUrl,
        token: signed.token,
        contentType: "video/mp4",
      })
    }
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!file || typeof file === "string") {
    return Response.json({ error: "multipart file field or signedUpload required" }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  if (!buf.length) return Response.json({ error: "empty file" }, { status: 400 })
  await uploadBuffer(RENDERS_BUCKET, storagePath, buf, "video/mp4")
  return Response.json({ bucket: RENDERS_BUCKET, path: storagePath, bytes: buf.length })
}
