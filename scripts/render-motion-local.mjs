#!/usr/bin/env node
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { synthesizeEdge } from "../lib/providers/tts/edge.js"

const WORK = process.env.MOTION_WORK || "/tmp/ep1-motion"
const OUT = process.env.RENDER_OUTPUT || path.join(WORK, "out", "episode-1-motion-v1.mp4")

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts })
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)))
  })
}

const plan = JSON.parse(await readFile(path.join(WORK, "plan.json"), "utf8"))
const clips = JSON.parse(await readFile(path.join(WORK, "clips.json"), "utf8"))
const byId = Object.fromEntries((clips.results || []).map((row) => [row.shotId, row]))

await mkdir(path.join(WORK, "audio"), { recursive: true })
await mkdir(path.join(WORK, "out"), { recursive: true })

const shots = []
for (const shot of plan.shots) {
  const clip = byId[shot.shotId]
  if (!clip?.local || !existsSync(clip.local)) continue
  const audioPath = path.join(WORK, "audio", `${shot.shotId}.mp3`)
  if (!existsSync(audioPath) && shot.narration) {
    const tts = await synthesizeEdge({ text: shot.narration, lang: "es", voice: "es-MX-DaliaNeural" })
    await writeFile(audioPath, tts.buffer)
    console.log("TTS", shot.shotId, tts.durationSec, tts.voice)
  }
  const durationSec = Number(clip.probedSec || shot.duration || 6)
  shots.push({
    shotId: shot.shotId,
    sceneIndex: shot.sceneIndex,
    src: `file://${clip.local}`,
    audioSrc: existsSync(audioPath) ? `file://${audioPath}` : null,
    durationSec,
    duration: durationSec,
    narration: shot.narration,
    text: shot.narration,
    dialogue: shot.dialogue,
  })
}

const props = {
  shots,
  language: "es",
  isRtl: false,
  fps: 30,
  watermark: true,
  subtitleEnabled: true,
  subtitleSize: 52,
}
const propsPath = path.join(WORK, "motion-props.json")
await writeFile(propsPath, JSON.stringify(props, null, 2))
console.log("SHOTS", shots.length, "secs", shots.reduce((s, x) => s + x.durationSec, 0))

await run(process.execPath, ["scripts/render-episode-local.mjs"], {
  env: {
    ...process.env,
    RENDER_PROPS: propsPath,
    RENDER_OUTPUT: OUT,
    RENDER_COMPOSITION: "MotionVideo",
  },
})

const encoded = path.join(WORK, "out", "episode-1-motion-v1.encoded.mp4")
await run("ffmpeg", [
  "-y", "-i", OUT,
  "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
  "-crf", "23", "-preset", "medium",
  "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000",
  "-movflags", "+faststart",
  encoded,
])
console.log("ENCODED", encoded)
