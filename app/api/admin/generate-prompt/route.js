export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { callLLM } from "@/lib/llm"

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { scene_text, scene_type, theme, visual_description, seriesId } = await request.json()

    const { text: imagePrompt } = await callLLM({
      system: `You are an expert at writing image generation prompts for cinematic vertical drama scenes.
Given a scene description, generate a detailed, specific image prompt optimized for AI image generation.
Focus on: composition, lighting, camera angle, mood, color palette, and specific visual elements.
The image will be 9:16 portrait format for mobile viewing.
DO NOT include character appearance descriptions — those will be injected separately.
Keep the prompt under 200 words. Output ONLY the prompt text, nothing else.`,
      user: `Scene type: ${scene_type}
Theme: ${theme}
Visual description: ${visual_description || scene_text}

Generate a cinematic image prompt for this scene.`,
      maxTokens: 500,
      seriesId,
    })

    return Response.json({ image_prompt: imagePrompt.trim() })
  } catch (err) {
    console.error("Prompt generation error:", err)
    return Response.json({ error: "Prompt generation failed" }, { status: 500 })
  }
}
