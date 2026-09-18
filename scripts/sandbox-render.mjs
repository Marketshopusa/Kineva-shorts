import { mkdir } from "node:fs/promises"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"

const started = Date.now()
const props = JSON.parse(await readFile("props.json", "utf8"))
const candidates = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean)
const browserExecutable = candidates.find((p) => existsSync(p))
if (!browserExecutable) {
  console.error("BROWSER_READY=false")
  process.exit(2)
}
console.log("BROWSER", browserExecutable)
await mkdir("/tmp/output", { recursive: true })
const bundled = await bundle({
  entryPoint: new URL("./remotion/index.js", import.meta.url).pathname,
  publicDir: null,
})
console.log("BUNDLED", bundled)
const composition = await selectComposition({
  serveUrl: bundled,
  id: "DramaVideo",
  inputProps: props,
  browserExecutable,
  chromiumOptions: { enableMultiProcessOnLinux: true },
})
console.log("COMP", composition.id, composition.width, composition.height, composition.durationInFrames, composition.fps)
const out = process.env.RENDER_OUTPUT || "/tmp/output/episode-1.mp4"
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: out,
  inputProps: props,
  browserExecutable,
  chromiumOptions: { enableMultiProcessOnLinux: true },
  concurrency: 1,
  onProgress: ({ progress }) => {
    const p = Math.round(progress * 100)
    if (p % 10 === 0) console.log("PROGRESS", p)
  },
})
console.log("RENDER_MS", Date.now() - started)
console.log("OUTPUT", out)
