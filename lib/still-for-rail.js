import { assertAdapterMatchesRail, blockedBalance, blockedConfig } from "@/lib/content-rails"
import { generateGeminiStill } from "@/lib/providers/images/gemini.js"
import { generateFalStill } from "@/lib/providers/images/fal.js"
import { dispatchStill } from "@/lib/providers/images/select.js"

export async function generateStillForRail(rail, prompt, config) {
  assertAdapterMatchesRail(rail, "image", rail.imageProvider)
  if (rail.videoProvider !== "remotion") {
    throw blockedConfig("video", "only Remotion Ken Burns is allowed")
  }

  return dispatchStill(rail.imageProvider, {
    gemini: () => generateGeminiStill(prompt, config),
    fal: async () => {
      if (!process.env.FAL_KEY) throw blockedConfig("image", "FAL_KEY absent")
      if (process.env.FAL_ALLOW_GENERATE !== "1") {
        throw blockedBalance("image", "Fal generate locked ($0). No Gemini/Leonardo fallback.")
      }
      const { dataUrl } = await generateFalStill(prompt)
      return dataUrl
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
