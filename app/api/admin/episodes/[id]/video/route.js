export const dynamic = "force-dynamic"
import { requireAdminOrTaskToken } from "@/lib/adminAuth"
import prisma from "@/lib/prisma"
import {
  getSignedUrl,
  RENDERS_BUCKET,
  renderCandidates,
  motionRenderPath,
  minimaxRenderPath,
  legacyAnimaticPath,
} from "@/lib/supabase-storage"
import { classifyRenderVersion } from "@/lib/video-clip-storage.js"

async function trySign(storagePath) {
  try {
    const url = await getSignedUrl(RENDERS_BUCKET, storagePath, 60 * 60 * 24)
    return { storagePath, url }
  } catch (err) {
    const msg = String(err?.message || err)
    if (/not found|Object not found/i.test(msg)) return null
    throw err
  }
}

async function resolveRender(episodeId, version) {
  const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
  if (!episode) return { error: "Not found", status: 404 }

  const motionPath = motionRenderPath(episode.seriesId, episode.id)
  const minimaxPath = minimaxRenderPath(episode.seriesId, episode.id)
  const legacyPath = legacyAnimaticPath(episode.seriesId, episode.id)
  const [motion, minimax, legacy] = await Promise.all([
    trySign(motionPath),
    trySign(minimaxPath),
    trySign(legacyPath),
  ])

  const paths = renderCandidates(episode.seriesId, episode.id, { version })
  let chosen = null
  let lastErr = null
  for (const storagePath of paths) {
    try {
      const hit = storagePath === motionPath
        ? motion
        : storagePath === minimaxPath
          ? minimax
        : storagePath === legacyPath
          ? legacy
          : await trySign(storagePath)
      if (hit) {
        chosen = hit
        break
      }
    } catch (err) {
      lastErr = err
      const msg = String(err?.message || err)
      if (/not found|Object not found/i.test(msg)) continue
      throw err
    }
  }
  if (!chosen) {
    if (lastErr) throw lastErr
    return { error: "No remote MP4 yet", status: 404 }
  }

  return {
    episode,
    storagePath: chosen.storagePath,
    url: chosen.url,
    version: classifyRenderVersion(chosen.storagePath),
    motionPath,
    minimaxPath,
    legacyPath,
    hasMotion: Boolean(motion),
    hasMinimax: Boolean(minimax),
    hasLegacy: Boolean(legacy),
    motionUrl: motion?.url || null,
    minimaxUrl: minimax?.url || null,
    legacyUrl: legacy?.url || null,
  }
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
  const session = await requireAdminOrTaskToken()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const episodeId = parseInt(id, 10)
  if (isNaN(episodeId)) return Response.json({ error: "Invalid id" }, { status: 400 })

  const version = new URL(request.url).searchParams.get("version") || undefined

  try {
    const resolved = await resolveRender(episodeId, version)
    if (resolved.error) return Response.json({ error: resolved.error }, { status: resolved.status })

    if (shouldProxyMedia(request)) {
      return await proxyMp4(request, resolved.url)
    }

    return Response.json({
      bucket: RENDERS_BUCKET,
      path: resolved.storagePath,
      url: resolved.url,
      version: resolved.version,
      hasMotion: resolved.hasMotion,
      hasMinimax: resolved.hasMinimax,
      hasLegacy: resolved.hasLegacy,
      motionPath: resolved.motionPath,
      minimaxPath: resolved.minimaxPath,
      legacyPath: resolved.legacyPath,
      motionUrl: resolved.motionUrl,
      minimaxUrl: resolved.minimaxUrl,
      legacyUrl: resolved.legacyUrl,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    const msg = String(err?.message || err)
    if (/not found|Object not found/i.test(msg)) {
      return Response.json({ error: "No remote MP4 yet" }, { status: 404 })
    }
    return Response.json({ error: "Failed to sign render" }, { status: 500 })
  }
}
