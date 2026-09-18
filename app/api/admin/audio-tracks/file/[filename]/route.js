export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { getPublicUrl, AUDIO_BUCKET } from "@/lib/supabase-storage"

export async function GET(request, { params }) {
  const { filename } = await params

  if (!/^[\w.-]+\.mp3$/.test(filename)) {
    return new Response("Not found", { status: 404 })
  }

  const track = await prisma.audioTrack.findFirst({ where: { storagePath: filename } })
  if (!track) return new Response("Not found", { status: 404 })

  const url = getPublicUrl(AUDIO_BUCKET, filename)
  return Response.redirect(url, 302)
}
