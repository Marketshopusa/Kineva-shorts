/**
 * dubUtils.js — shared helpers for multi-language dub selection.
 *
 * dubScenes can be in two formats:
 *   NEW (nested): { en: { "0": {url,path,durationSec}, ... }, tr: { ... } }
 *   OLD (flat):   { "0": {url,path,durationSec}, ... }   ← treated as "en"
 */

/**
 * Returns true when dubScenes uses the new nested-by-language format.
 */
export function isNestedDubScenes(dubScenes) {
  if (!dubScenes || typeof dubScenes !== "object") return false
  // Nested format: values are objects whose own values are dub-info objects (have .url/.path)
  // Flat format: values ARE dub-info objects (have .url/.path directly)
  const firstVal = Object.values(dubScenes)[0]
  if (!firstVal || typeof firstVal !== "object") return false
  // If the first value has a "url" key it's a flat (old) record, otherwise it's nested
  return !("url" in firstVal)
}

/**
 * Normalize any dubScenes format into the nested format { [lang]: { [sceneIdx]: {...} } }.
 * Old flat format is wrapped as { en: dubScenes }.
 */
export function normalizeDubScenes(dubScenes) {
  if (!dubScenes) return null
  if (isNestedDubScenes(dubScenes)) return dubScenes
  return { en: dubScenes }
}

/**
 * Select the scene-map for a specific language with fallback logic:
 *   1. Exact language match
 *   2. defaultDubLang (user-designated primary)
 *   3. Auto-select if only one language exists
 *   4. null (no dub available)
 */
export function selectDubForLang(dubScenes, lang, defaultDubLang) {
  if (!dubScenes) return null
  const nested = normalizeDubScenes(dubScenes)
  if (!nested) return null

  if (nested[lang]) return nested[lang]
  if (defaultDubLang && nested[defaultDubLang]) return nested[defaultDubLang]
  const langs = Object.keys(nested)
  if (langs.length === 1) return nested[langs[0]]
  return null
}

/**
 * Compute what defaultDubLang should be after clearing one language's dub.
 * - If no dubs remain → null
 * - If one dub remains → that language
 * - If the cleared lang was the default → pick first remaining
 * - Otherwise → keep current default
 */
export function recalcDefaultDubLang(dubScenes, clearedLang, currentDefault) {
  const nested = normalizeDubScenes(dubScenes)
  if (!nested) return null
  const remaining = Object.keys(nested).filter((l) => l !== clearedLang)
  if (remaining.length === 0) return null
  if (remaining.length === 1) return remaining[0]
  if (currentDefault === clearedLang) return remaining[0]
  return currentDefault
}
