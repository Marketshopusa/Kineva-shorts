export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { after } from "next/server"
import path from "path"
import fs from "fs"
import os from "os"
import http from "http"
import { randomUUID } from "crypto"
import prisma from "@/lib/prisma"
import { downloadAsBuffer, IMAGES_BUCKET } from "@/lib/supabase-storage"
import { readDubBuffer } from "@/lib/dub-storage"
import { selectDubForLang } from "@/lib/dubUtils"
import { sniffImageContentType } from "@/lib/image-bytes"

const FPS = 30

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, "0.0.0.0", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on("error", reject)
  })
}

async function resolveImages(imageUrls) {
  return Promise.all(
    (imageUrls || []).map(async (url, i) => {
      if (!url) return null
      try {
        const apiMatch = url.match(/\/api\/(?:admin|public)\/images\/(\d+)/)
        if (apiMatch) {
          const imageId = parseInt(apiMatch[1])
          const image = await prisma.image.findUnique({ where: { id: imageId } })
          if (!image) return null
          // Supabase storage path (e.g. episodes/135/2.png)
          const buffer = await downloadAsBuffer(IMAGES_BUCKET, image.filePath)
          const sniffed = sniffImageContentType(buffer)
          const mime = sniffed !== "application/octet-stream" ? sniffed : "image/png"
          return `data:${mime};base64,${buffer.toString("base64")}`
        }
        if (url.startsWith("data:")) return url
        if (url.startsWith("http://") || url.startsWith("https://")) {
          const res = await fetch(url)
          if (!res.ok) return null
          const arrayBuf = await res.arrayBuffer()
          const contentType = res.headers.get("content-type") || "image/png"
          return `data:${contentType};base64,${Buffer.from(arrayBuf).toString("base64")}`
        }
        return null
      } catch (err) {
        console.error(`Failed to resolve image ${i}:`, err.message)
        return null
      }
    })
  )
}

function writeStatus(jobDir, data) {
  fs.writeFileSync(path.join(jobDir, "status.json"), JSON.stringify(data))
}

async function resolveDubScenes(dubScenes, language, defaultDubLang, jobDir) {
  if (!dubScenes) return null
  // Select the scene-map for the requested language (with fallback to primary dub)
  const langScenes = selectDubForLang(dubScenes, language, defaultDubLang)
  if (!langScenes) return null

  // Pre-download all dub audio to data URLs so Remotion doesn't need to make
  // network calls at render time (Supabase public URLs can fail in the render env).
  const resolved = {}
  const errors = []
  await Promise.all(
    Object.entries(langScenes).map(async ([idx, info]) => {
      const isObj = typeof info === "object" && info !== null
      const url = isObj ? info.url : (typeof info === "string" ? info : null)
      const storagePath = isObj ? info.path : null
      const durationSec = isObj ? (info.durationSec ?? null) : null
      if (!url && !storagePath) return
      try {
        const buf = await readDubBuffer({ path: storagePath, url })
        const base64 = `data:audio/mpeg;base64,${buf.toString("base64")}`
        resolved[idx] = durationSec != null ? { url: base64, durationSec } : base64
      } catch (err) {
        errors.push(`scene ${idx}: ${err.message}`)
        // Fall back to original URL so Remotion can still try
        if (url) resolved[idx] = durationSec != null ? { url, durationSec } : url
      }
    })
  )
  if (errors.length > 0) {
    writeStatus(jobDir, { status: "rendering", step: "dub-warnings", errors })
  }
  return Object.keys(resolved).length > 0 ? resolved : null
}

async function runExport(jobDir, { scenes, imageUrls, language, isRtl, watermark, watermarkText, watermarkSize, watermarkColor, watermarkOpacity, musicUrl, musicVolume, dubScenes = null, defaultDubLang = null, subtitleEnabled = true, subtitleSize = 62 }) {
  let bundleLocation = null
  try {
    writeStatus(jobDir, { status: "rendering" })

    const { bundle } = await import("@remotion/bundler")
    const { renderMedia, selectComposition } = await import("@remotion/renderer")

    const outputPath = path.join(jobDir, `episode-${language}.mp4`)
    const entryPoint = path.resolve(process.cwd(), "remotion/index.js")
    bundleLocation = await bundle({
      entryPoint,
      webpackOverride: (config) => config,
      publicDir: null,
    })

    writeStatus(jobDir, { status: "rendering", step: "resolving-assets", dubScenesReceived: dubScenes ? Object.keys(dubScenes).length : 0 })

    const [resolvedImageUrls, resolvedDubScenes] = await Promise.all([
      resolveImages(imageUrls),
      resolveDubScenes(dubScenes, language, defaultDubLang, jobDir),
    ])

    writeStatus(jobDir, { status: "rendering", step: "bundling", dubScenesResolved: resolvedDubScenes ? Object.keys(resolvedDubScenes).length : 0 })

    let resolvedMusicUrl = null
    if (musicUrl) {
      let musicPath = null
      const customMatch = musicUrl.match(/\/api\/admin\/audio-tracks\/file\/(.+)/)
      if (customMatch) {
        musicPath = path.join(process.cwd(), "uploads", "audio", customMatch[1])
      } else {
        musicPath = path.join(process.cwd(), "public", musicUrl)
      }
      if (musicPath && fs.existsSync(musicPath)) {
        const ext = path.extname(musicPath).replace(".", "") || "mp3"
        const mime = ext === "mp3" ? "mpeg" : ext
        const buf = fs.readFileSync(musicPath)
        resolvedMusicUrl = `data:audio/${mime};base64,${buf.toString("base64")}`
      }
    }

    const inputProps = {
      scenes, imageUrls: resolvedImageUrls, language, isRtl, fps: FPS,
      watermark: !!watermark,
      watermarkText: watermarkText || "KINEVA",
      watermarkSize: watermarkSize || 48,
      watermarkColor: watermarkColor || "#FFFFFF",
      watermarkOpacity: watermarkOpacity || 0.4,
      musicUrl: resolvedMusicUrl,
      musicVolume: musicVolume ?? 1.0,
      dubScenes: resolvedDubScenes,
      subtitleEnabled: subtitleEnabled !== false,
      subtitleSize: subtitleSize || 62,
    }

    const BROWSER = (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH))
      ? process.env.CHROMIUM_PATH
      : null
    const port1 = await findFreePort()
    const port2 = await findFreePort()

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "DramaVideo",
      inputProps,
      port: port1,
      browserExecutable: BROWSER,
    })

    let lastProgress = 0
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      port: port2,
      browserExecutable: BROWSER,
      concurrency: 2,
      onProgress: ({ progress }) => {
        const p = Math.round(progress * 100)
        if (p > lastProgress) {
          lastProgress = p
          writeStatus(jobDir, { status: "rendering", progress: p })
        }
      },
    })

    if (bundleLocation && fs.existsSync(bundleLocation)) {
      fs.rmSync(bundleLocation, { recursive: true, force: true })
    }

    writeStatus(jobDir, { status: "done", filename: `episode-${language}.mp4` })
  } catch (err) {
    console.error("Export error:", err)
    if (bundleLocation && fs.existsSync(bundleLocation)) {
      fs.rmSync(bundleLocation, { recursive: true, force: true })
    }
    writeStatus(jobDir, { status: "error", error: err.message })
  }
}

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  if (process.env.VERCEL) {
    return Response.json(
      {
        error:
          "RENDER_WORKER_REQUIRED: Remotion needs Chromium, ffmpeg, RAM, and a long-running worker; Vercel serverless has none of these.",
        code: "RENDER_WORKER_REQUIRED",
      },
      { status: 501 },
    )
  }

  const data = await request.json()
  if (!data.scenes?.length) {
    return Response.json({ error: "No scenes provided" }, { status: 400 })
  }

  // Load global settings for watermark defaults
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } })

  // Only override with request data if values are explicitly provided (not undefined)
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  )

  const mergedData = {
    watermark: settings?.watermarkEnabled ?? true,
    watermarkText: settings?.watermarkText || "KINEVA",
    watermarkSize: settings?.watermarkSize || 48,
    watermarkColor: settings?.watermarkColor || "#FFFFFF",
    watermarkOpacity: settings?.watermarkOpacity || 0.4,
    ...cleanData
  }

  const jobId = randomUUID()
  const jobDir = path.join(os.tmpdir(), `export-${jobId}`)
  fs.mkdirSync(jobDir)
  writeStatus(jobDir, { status: "pending", startedAt: Date.now() })

  // Schedule the render to run after the response is sent.
  // Using next/server `after()` ensures the background task isn't killed
  // when Next.js closes the request context.
  after(async () => {
    await runExport(jobDir, mergedData)
  })

  return Response.json({ jobId })
}
