import { readFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"

const started = Date.now()
const propsPath = process.env.RENDER_PROPS || "/tmp/ep1/props.json"
const out = process.env.RENDER_OUTPUT || "/tmp/ep1/out/episode-1.mp4"
const props = JSON.parse(await readFile(propsPath, "utf8"))
const browserExecutable = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome",
].filter(Boolean).find((p) => existsSync(p))
if (!browserExecutable) {
  console.error("BROWSER_READY=false")
  process.exit(2)
}
console.log("BROWSER", browserExecutable)
await mkdir(path.dirname(out), { recursive: true })
const bundled = await bundle({
  entryPoint: path.resolve(process.cwd(), "remotion/index.js"),
  publicDir: null,
})
console.log("BUNDLED", bundled)
const compositionId = process.env.RENDER_COMPOSITION || "DramaVideo"
const composition = await selectComposition({
  serveUrl: bundled,
  id: compositionId,
  inputProps: props,
  browserExecutable,
  chromiumOptions: { enableMultiProcessOnLinux: true },
})
console.log(
  "COMP",
  composition.id,
  composition.width,
  composition.height,
  composition.durationInFrames,
  composition.fps,
)
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  audioCodec: "aac",
  outputLocation: out,
  inputProps: props,
  browserExecutable,
  chromiumOptions: { enableMultiProcessOnLinux: true },
  concurrency: 1,
  onProgress: ({ progress }) => {
    const p = Math.round(progress * 100)
    if (p % 5 === 0) console.log("PROGRESS", p)
  },
})
console.log("RENDER_MS", Date.now() - started)
console.log("OUTPUT", out)
