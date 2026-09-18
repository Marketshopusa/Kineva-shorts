import test from "node:test"
import assert from "node:assert/strict"
import {
  sceneCount,
  episodeIsPopulated,
  episodeIsWatchable,
  shouldRedirectToWizard,
  episodeCardAction,
  seriesPrimaryAction,
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
