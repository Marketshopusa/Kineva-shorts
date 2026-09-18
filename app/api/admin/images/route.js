export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { uploadBuffer, imagePath, getPublicUrl, IMAGES_BUCKET } from "@/lib/supabase-storage"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const data = await request.json()
    const { episodeId, sceneIndex, imageData, prompt } = data

    if (!episodeId || sceneIndex == null || !imageData) {
      return Response.json({ error: "episodeId, sceneIndex, and imageData are required" }, { status: 400 })
    }

    const epId = parseInt(episodeId)
    const scIdx = parseInt(sceneIndex)

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "")
    const buffer = Buffer.from(base64Data, "base64")
    // Use a timestamp version so each save gets a unique CDN URL, avoiding stale cache
    const storagePath = imagePath(epId, scIdx, Date.now())

    await uploadBuffer(IMAGES_BUCKET, storagePath, buffer, "image/png")

    const image = await prisma.image.upsert({
      where: { episodeId_sceneIndex: { episodeId: epId, sceneIndex: scIdx } },
      update: { filePath: storagePath, prompt: prompt || null },
      create: { episodeId: epId, sceneIndex: scIdx, filePath: storagePath, prompt: prompt || null, width: 1080, height: 1920 },
    })

    const cdnUrl = getPublicUrl(IMAGES_BUCKET, storagePath)
    return Response.json({ id: image.id, filePath: storagePath, url: cdnUrl })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
