import { GoogleGenAI } from "@google/genai"
import { isQuotaError, quotaBlockMessage } from "./select.js"
import { STILL_ROUTE_REFERENCE, buildGeminiStillContents, referenceAwareFailure } from "./still-request.js"

export async function generateGeminiStill(promptOrOpts, config) {
  const apiKey = config.googleApiKey
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured")
  const model = config.geminiImageModel || "gemini-2.5-flash-lite"
  const planned = buildGeminiStillContents(promptOrOpts)
  const ai = new GoogleGenAI({ apiKey })
  try {
    const response = await ai.models.generateContent({
      model,
      contents: planned.contents,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    })
    const parts = response.candidates?.[0]?.content?.parts || []
    const imagePart = parts.find((p) => p.inlineData)
    if (!imagePart?.inlineData) {
      if (planned.route === STILL_ROUTE_REFERENCE) {
        throw referenceAwareFailure("Gemini reference-aware returned no image")
      }
      throw new Error("No image returned from Gemini")
    }
    const { mimeType, data } = imagePart.inlineData
    return `data:${mimeType};base64,${data}`
  } catch (err) {
    if (err?.code === "REFERENCE_AWARE_FAILED") throw err
    if (isQuotaError(err)) {
      const e = new Error(quotaBlockMessage("gemini"))
      e.status = 429
      throw e
    }
    if (planned.route === STILL_ROUTE_REFERENCE) {
      throw referenceAwareFailure(err.message || "Gemini reference-aware failed")
    }
    throw err
  }
}
