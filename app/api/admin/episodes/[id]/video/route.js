export const dynamic = "force-dynamic"
import { requireAdmin } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import { getSignedUrl, RENDERS_BUCKET, renderPath } from "@/lib/supabase-storage"

async function resolveRender(episodeId) {
  const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
  if (!episode) return { error: "Not found", status: 404 }
  const storagePath = renderPath(episode.seriesId, episode.id)
  const url = await getSignedUrl(RENDERS_BUCKET, storagePath, 60 * 60 * 24)
  return { episode, storagePath, url }
}

function shouldProxyMedia(request) {
  const url = new URL(request.url)
  const range = request.headers.get("range")
  const accept = request.headers.get("accept") || ""
  return Boolean(range) || url.searchParams.get("play") === "1" || accept.includes("video/")
}

async function proxyMp4(request, url) {
  const range = request.headers.get("range")
  const upstream = await fetch(url, {
    headers: range ? { Range: range } : {},
  })
  const headers = new Headers()
  headers.set("Content-Type", upstream.headers.get("Content-Type") || "video/mp4")
  headers.set("Accept-Ranges", upstream.headers.get("Accept-Ranges") || "bytes")
  const contentRange = upstream.headers.get("Content-Range")
  if (contentRange) headers.set("Content-Range", contentRange)
  const contentLength = upstream.headers.get("Content-Length")
  if (contentLength) headers.set("Content-Length", contentLength)
  headers.set("Cache-Control", "private, max-age=0")
  return new Response(upstream.body, { status: upstream.status, headers })
}

export async function GET(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  try {
    const resolved = await resolveRender(episodeId)
    if (resolved.error) return Response.json({ error: resolved.error }, { status: resolved.status })

    if (shouldProxyMedia(request)) {
      return await proxyMp4(request, resolved.url)
    }

    return Response.json({
      bucket: RENDERS_BUCKET,
      path: resolved.storagePath,
      url: resolved.url,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    const msg = String(err?.message || err)
    if (/not found|Object not found/i.test(msg)) {
      return Response.json({ error: "No remote MP4 yet" }, { status: 404 })
    }
    return Response.json({ error: "Failed to sign render" }, { status: 500 })
  }
}
