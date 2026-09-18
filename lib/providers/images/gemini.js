import { GoogleGenAI } from "@google/genai"
import { isQuotaError, quotaBlockMessage } from "./select.js"

export async function generateGeminiStill(prompt, config) {
  const apiKey = config.googleApiKey
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured")
  const model = config.geminiImageModel || "gemini-2.5-flash-lite"
  const ai = new GoogleGenAI({ apiKey })
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    })
    const parts = response.candidates?.[0]?.content?.parts || []
    const imagePart = parts.find((p) => p.inlineData)
    if (!imagePart?.inlineData) throw new Error("No image returned from Gemini")
    const { mimeType, data } = imagePart.inlineData
    return `data:${mimeType};base64,${data}`
  } catch (err) {
    if (isQuotaError(err)) {
      const e = new Error(quotaBlockMessage("gemini"))
      e.status = 429
      throw e
    }
    throw err
  }
}
