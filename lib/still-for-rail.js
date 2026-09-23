import { assertAdapterMatchesRail, blockedBalance, blockedConfig } from "@/lib/content-rails"
import { generateGeminiStill } from "@/lib/providers/images/gemini.js"
import { generateFalStill } from "@/lib/providers/images/fal.js"
import { dispatchStill } from "@/lib/providers/images/select.js"
import { normalizeStillInput } from "@/lib/providers/images/still-request.js"
import { runProviderAfterImagesBucketReady } from "@/lib/storage-preflight.js"
import { resolveStillInputForProvider } from "@/lib/still-preflight.js"

export async function generateStill({
  prompt,
  referenceImageUrl,
  referenceImageUrls,
  references,
  aspectRatio,
  metadata,
  rail,
  config,
}) {
  return generateStillForRail(
    rail,
    { prompt, referenceImageUrl, referenceImageUrls, references, aspectRatio, metadata },
    config,
  )
}

export async function generateStillForRail(rail, promptOrOpts, config, { assertStorageReady, resolveInput } = {}) {
  assertAdapterMatchesRail(rail, "image", rail.imageProvider)
  if (rail.videoProvider !== "remotion") {
    throw blockedConfig("video", "only Remotion Ken Burns is allowed")
  }

  const request = normalizeStillInput(promptOrOpts)
  const resolved = await (resolveInput || resolveStillInputForProvider)(request)

  return dispatchStill(rail.imageProvider, {
    gemini: () => generateGeminiStill(resolved, config),
    fal: async () => {
      if (!process.env.FAL_KEY) throw blockedConfig("image", "FAL_KEY absent")
      if (process.env.FAL_ALLOW_GENERATE !== "1") {
        throw blockedBalance("image", "Fal generate locked ($0). No Gemini/Leonardo fallback.")
      }
      return runProviderAfterImagesBucketReady(async () => {
        const { dataUrl } = await generateFalStill(resolved)
        return dataUrl
      }, assertStorageReady ? { assertFn: assertStorageReady } : {})
    },
    leonardo: async () => {
      throw blockedConfig("image", "Leonardo is not on any content rail")
    },
    openai: async () => {
      throw blockedConfig("image", "OpenAI stills are not on any content rail")
    },
    qwen: async () => {
      throw blockedConfig("image", "Qwen stills are not the image rail (text only)")
    },
  })
}
