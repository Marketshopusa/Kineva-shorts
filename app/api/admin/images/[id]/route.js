export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { getPublicUrl, IMAGES_BUCKET } from "@/lib/supabase-storage"
import fs from "fs"
import path from "path"

export async function GET(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const image = await prisma.image.findUnique({ where: { id: parseInt(id) } })
    if (!image) return Response.json({ error: "Not found" }, { status: 404 })

    // Local filesystem images (stored under uploads/)
    if (image.filePath.startsWith("uploads/")) {
      const fullPath = path.join(process.cwd(), image.filePath)
      if (fs.existsSync(fullPath)) {
        const buf = fs.readFileSync(fullPath)
        return new Response(buf, {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000" },
        })
      }
    }

    // Supabase-hosted images
    const url = getPublicUrl(IMAGES_BUCKET, image.filePath)
    return Response.redirect(url, 302)
  } catch (error) {
    return Response.json({ error: "Failed to load image" }, { status: 500 })
  }
}
