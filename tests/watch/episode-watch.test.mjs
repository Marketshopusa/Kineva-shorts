import test from "node:test"
import assert from "node:assert/strict"
import {
  sceneCount,
  episodeIsPopulated,
  episodeIsWatchable,
  shouldRedirectToWizard,
  episodeCardAction,
  seriesPrimaryAction,
  episodeDurationSec,
  episodeHasAudio,
  isUsableEpisodeStill,
  episodeBlurb,
  episodeCardCtaLabel,
  episodePipelineLabels,
  watchVersionLabel,
  watchVersionOptions,
  watchPlayQuery,
  watchDownloadName,
} from "../../lib/episode-watch.js"

const populated = {
  id: 1,
  episodeNumber: 1,
  status: "screenplay",
  screenplay: { scenes: [{}, {}, {}, {}, {}, {}] },
}

test("six scenes count as populated even while status is screenplay", () => {
  assert.equal(sceneCount(populated), 6)
  assert.equal(episodeIsPopulated(populated), true)
  assert.equal(shouldRedirectToWizard(populated), false)
  assert.equal(episodeIsWatchable(populated, true), true)
  assert.equal(episodeCardAction(populated, true), "watch")
})

test("empty in-progress episode still goes to the wizard", () => {
  const ep = { id: 2, status: "screenplay", screenplay: { scenes: [] } }
  assert.equal(shouldRedirectToWizard(ep), true)
  assert.equal(episodeCardAction(ep, false), "continue")
})

test("series primary CTA is Watch when scenes and render exist", () => {
  const action = seriesPrimaryAction([populated], { 1: { url: "https://example.test/demo.mp4" } })
  assert.equal(action.type, "watch")
  assert.equal(action.episode.id, 1)
})

test("series primary CTA is Continue only when nothing is populated", () => {
  const ep = { id: 3, episodeNumber: 1, status: "setup" }
  const action = seriesPrimaryAction([ep], {})
  assert.equal(action.type, "continue")
})

const visualsPending = {
  id: 10,
  episodeNumber: 1,
  title: "El mensaje",
  status: "visuals",
  summary: "Elena recibe una llamada imposible.",
  screenplay: {
    scenes: [
      { duration_sec: 8, text_es: "Elena escucha el mensaje otra vez." },
      { duration_sec: 10 },
      { duration_sec: 7 },
      { duration_sec: 9 },
      { duration_sec: 6 },
      { duration_sec: 8 },
    ],
  },
}

test("episode without still or video stays Open Episode with pending visuals", () => {
  assert.equal(episodeCardAction(visualsPending, false), "view")
  assert.equal(episodeCardCtaLabel("view"), "Open Episode")
  assert.equal(sceneCount(visualsPending), 6)
  assert.equal(episodeDurationSec(visualsPending), 48)
  assert.equal(episodeHasAudio(visualsPending), false)
  assert.equal(isUsableEpisodeStill(null), false)
  const labels = episodePipelineLabels({ hasStill: false, hasAudio: false, hasRender: false })
  assert.equal(labels.visual, "Visuals pending")
  assert.equal(labels.video, "Video pending")
  assert.equal(episodeBlurb(visualsPending), "Elena recibe una llamada imposible.")
})

test("episode with audio but no still or video does not show Watch", () => {
  const dubbed = {
    ...visualsPending,
    dubScenes: { es: { "0": { url: "episodes/2/1/0.mp3", durationSec: 8 } } },
  }
  assert.equal(episodeHasAudio(dubbed), true)
  assert.equal(episodeCardAction(dubbed, false), "view")
  assert.notEqual(episodeCardCtaLabel(episodeCardAction(dubbed, false)), "Watch Episode")
  assert.equal(episodePipelineLabels({ hasStill: false, hasAudio: true, hasRender: false }).audio, "Audio ready")
})

test("usable still is accepted and test stills are rejected", () => {
  assert.equal(isUsableEpisodeStill("/api/admin/images/12"), true)
  assert.equal(isUsableEpisodeStill("/media/test-stills/elena.png"), false)
  assert.equal(isUsableEpisodeStill("TEST STILL"), false)
})

test("MP4 unlocks Watch Episode CTA", () => {
  assert.equal(episodeCardAction(populated, true), "watch")
  assert.equal(episodeCardCtaLabel("watch"), "Watch Episode")
  assert.equal(episodePipelineLabels({ hasStill: true, hasAudio: true, hasRender: true }).video, "Video ready")
})

test("empty in-progress episode CTA is Continue Visuals", () => {
  assert.equal(episodeCardCtaLabel("continue"), "Continue Visuals")
})

test("Watch labels distinguish MiniMax standard from Ken Burns preview", () => {
  assert.equal(watchVersionLabel("minimax"), "Standard (MiniMax H3)")
  assert.equal(watchVersionLabel("legacy"), "Preview Animatic")
  assert.equal(watchPlayQuery("minimax"), "&version=minimax")
  assert.equal(watchDownloadName("minimax"), "episode-1-minimax-v1.mp4")
  const opts = watchVersionOptions({ hasMinimax: true, hasLegacy: true, hasMotion: false })
  assert.deepEqual(opts.map((o) => o.id), ["minimax", "legacy"])
})

test("multiple populated episodes keep independent watch/view actions", () => {
  const second = { ...populated, id: 2, episodeNumber: 2, title: "La respuesta" }
  const action = seriesPrimaryAction([visualsPending, second], { 2: { url: "https://example.test/ep2.mp4" } })
  assert.equal(action.type, "watch")
  assert.equal(action.episode.id, 2)
  assert.equal(episodeCardAction(visualsPending, false), "view")
  assert.equal(episodeCardAction(second, true), "watch")
})
