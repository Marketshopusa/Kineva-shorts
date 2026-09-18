export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { NextResponse } from "next/server"
import { uploadBuffer, getPublicUrl, LOGOS_BUCKET } from "@/lib/supabase-storage"
import { getTtsEngine, listNeuralVoices } from "@/lib/providers/tts/voices"

function ttsPayload() {
  const ttsEngine = getTtsEngine()
  return {
    ttsEngine,
    ttsVoices: listNeuralVoices(),
    ttsReady: ttsEngine === "edge" || !!process.env.ELEVENLABS_API_KEY,
    elevenLabsConfigured: !!process.env.ELEVENLABS_API_KEY,
  }
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } })
    const base = settings || {}
    return NextResponse.json({
      id:                   1,
      logoUrl:              base.logoUrl              ?? null,
      watermarkEnabled:     base.watermarkEnabled     ?? true,
      watermarkText:        base.watermarkText        ?? "KINEVA",
      watermarkSize:        base.watermarkSize        ?? 48,
      watermarkColor:       base.watermarkColor       ?? "#FFFFFF",
      watermarkOpacity:     base.watermarkOpacity     ?? 0.4,
      llmProvider:          base.llmProvider          || "anthropic",
      defaultImageProvider: base.defaultImageProvider || "gemini",
      geminiImageModel:     base.geminiImageModel     || "",
      leonardoModelId:      base.leonardoModelId      || null,
      elevenLabsVoiceId:    base.elevenLabsVoiceId    || "",
      ...ttsPayload(),
      configuredProviders: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        google:    !!process.env.GOOGLE_API_KEY,
        openai:    !!process.env.OPENAI_API_KEY,
        qwen:      !!process.env.QWEN_API_KEY,
        leonardo:  !!process.env.LEONARDO_API_KEY,
      },
    })
  } catch (err) {
    console.error("Failed to load settings:", err)
    return NextResponse.json({ id: 1, logoUrl: null, watermarkEnabled: true, watermarkText: "KINEVA", watermarkSize: 48, watermarkColor: "#FFFFFF", watermarkOpacity: 0.4, configuredProviders: {} })
  }
}

export async function PUT(req) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    let logoUrl = body.logoUrl || null

    // Handle base64 image upload
    if (logoUrl && logoUrl.startsWith("data:image/")) {
      const match = logoUrl.match(/^data:image\/(\w+);base64,(.+)$/)
      if (match) {
        const ext = match[1] === "svg+xml" ? "svg" : match[1]
        const buffer = Buffer.from(match[2], "base64")
        const contentType = ext === "svg" ? "image/svg+xml" : `image/${ext}`
        const storagePath = `logo.${ext}`
        await uploadBuffer(LOGOS_BUCKET, storagePath, buffer, contentType)
        logoUrl = getPublicUrl(LOGOS_BUCKET, storagePath)
      }
    }

    // Build update data dynamically so partial saves don't reset other fields
    const updateData = { logoUrl }
    if (typeof body.watermarkEnabled === "boolean") {
      updateData.watermarkEnabled = body.watermarkEnabled
    }
    if (typeof body.watermarkText === "string") {
      updateData.watermarkText = body.watermarkText.trim() || "KINEVA"
    }
    if (typeof body.watermarkSize === "number" && body.watermarkSize >= 16 && body.watermarkSize <= 120) {
      updateData.watermarkSize = body.watermarkSize
    }
    if (typeof body.watermarkColor === "string" && /^#[0-9A-Fa-f]{3,6}$/.test(body.watermarkColor)) {
      updateData.watermarkColor = body.watermarkColor
    }
    if (typeof body.watermarkOpacity === "number" && body.watermarkOpacity >= 0.1 && body.watermarkOpacity <= 1) {
      updateData.watermarkOpacity = body.watermarkOpacity
    }

    // Non-secret settings stored in DB
    const nonSecretFields = ["leonardoModelId", "geminiImageModel", "elevenLabsVoiceId"]
    for (const field of nonSecretFields) {
      if (field in body) {
        updateData[field] = body[field] ? String(body[field]).trim() || null : null
      }
    }

    if (typeof body.llmProvider === "string" && ["anthropic", "openai", "google", "qwen"].includes(body.llmProvider)) {
      updateData.llmProvider = body.llmProvider
    }

    const validProviders = ["gemini", "qwen", "openai", "leonardo", "leonardo-nano", "leonardo-gpt2"]
    if (typeof body.defaultImageProvider === "string" && validProviders.includes(body.defaultImageProvider)) {
      updateData.defaultImageProvider = body.defaultImageProvider
    }

    const settings = await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: updateData,
      create: {
        id: 1,
        logoUrl,
        watermarkEnabled: body.watermarkEnabled ?? true,
        watermarkText: body.watermarkText ?? "KINEVA",
        watermarkSize: body.watermarkSize ?? 48,
        watermarkColor: body.watermarkColor ?? "#FFFFFF",
        watermarkOpacity: body.watermarkOpacity ?? 0.4,
      },
    })

    return NextResponse.json({
      id:                   1,
      logoUrl:              settings.logoUrl              ?? null,
      watermarkEnabled:     settings.watermarkEnabled     ?? true,
      watermarkText:        settings.watermarkText        ?? "KINEVA",
      watermarkSize:        settings.watermarkSize        ?? 48,
      watermarkColor:       settings.watermarkColor       ?? "#FFFFFF",
      watermarkOpacity:     settings.watermarkOpacity     ?? 0.4,
      llmProvider:          settings.llmProvider          || "anthropic",
      defaultImageProvider: settings.defaultImageProvider || "gemini",
      geminiImageModel:     settings.geminiImageModel     || "",
      leonardoModelId:      settings.leonardoModelId      || null,
      elevenLabsVoiceId:    settings.elevenLabsVoiceId    || "",
      ...ttsPayload(),
      configuredProviders: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        google:    !!process.env.GOOGLE_API_KEY,
        openai:    !!process.env.OPENAI_API_KEY,
        qwen:      !!process.env.QWEN_API_KEY,
        leonardo:  !!process.env.LEONARDO_API_KEY,
      },
    })
  } catch (err) {
    console.error("Failed to save settings:", err)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
