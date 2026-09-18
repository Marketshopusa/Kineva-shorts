export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import path from "path"
import fs from "fs"
import os from "os"
import { Readable } from "stream"

export async function GET(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { jobId } = await params
  // Strip optional .mp4 suffix and validate UUID format
  const cleanJobId = jobId.replace(/\.mp4$/, "")
  if (!/^[0-9a-f-]{36}$/.test(cleanJobId)) {
    return Response.json({ error: "Invalid job ID" }, { status: 400 })
  }

  const jobDir = path.join(os.tmpdir(), `export-${cleanJobId}`)
  const statusFile = path.join(jobDir, "status.json")

  if (!fs.existsSync(statusFile)) {
    return Response.json({ error: "Job not found" }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const isDownload = searchParams.has("download")
  const status = JSON.parse(fs.readFileSync(statusFile, "utf8"))

  if (status.status === "done") {
    if (isDownload) {
      const videoPath = path.join(jobDir, status.filename)
      if (!fs.existsSync(videoPath)) {
        return Response.json({ error: "File already downloaded or expired" }, { status: 410 })
      }

      const stat = fs.statSync(videoPath)
      // Stream the file instead of buffering it entirely — avoids OOM for large videos
      const nodeStream = fs.createReadStream(videoPath)
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)))
          nodeStream.on("end", () => {
            controller.close()
            // Clean up after the stream is fully sent
            fs.rmSync(jobDir, { recursive: true, force: true })
          })
          nodeStream.on("error", (err) => controller.error(err))
        },
        cancel() {
          nodeStream.destroy()
        },
      })

      const filename = status.filename || "video.mp4"
      return new Response(webStream, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Length": stat.size.toString(),
        },
      })
    }
    return Response.json(status)
  }

  return Response.json(status)
}
