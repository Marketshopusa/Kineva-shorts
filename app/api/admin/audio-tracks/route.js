export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/adminAuth"
import { AUDIO_TRACKS } from "@/config/audioTracks"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { uploadBuffer, deletePaths, getPublicUrl, AUDIO_BUCKET } from "@/lib/supabase-storage"

export async function GET(request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const includeHidden = searchParams.get("includeHidden") === "true"

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } })
  const hiddenTracks = settings?.hiddenTracks || []

  const builtIn = AUDIO_TRACKS
    .map((track) => ({
      ...track,
      available: true,
      custom: false,
      hidden: hiddenTracks.includes(track.id),
    }))
    .filter((track) => includeHidden || !track.hidden)

  const customRecords = await prisma.audioTrack.findMany({ orderBy: { createdAt: "desc" } })
  const custom = customRecords.map((t) => ({
    id: t.id,
    name: t.name,
    file: getPublicUrl(AUDIO_BUCKET, t.storagePath),
    filename: t.storagePath,
    mood: t.mood,
    genre: t.genre,
    bpm: t.bpm,
    tags: t.tags,
    description: t.description,
    custom: true,
    hidden: false,
    available: true,
  }))

  return NextResponse.json({ tracks: [...builtIn, ...custom] })
}

export async function POST(request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const name = formData.get("name")?.toString().trim()
    const mood = formData.get("mood")?.toString().trim() || ""
    const genre = formData.get("genre")?.toString().trim() || ""
    const bpm = parseInt(formData.get("bpm") || "0") || null
    const tags = formData.get("tags")?.toString().trim() || ""
    const description = formData.get("description")?.toString().trim() || ""

    if (!file || !name) {
      return NextResponse.json({ error: "File and name are required" }, { status: 400 })
    }

    if (file.type && !file.type.startsWith("audio/")) {
      return NextResponse.json({ error: "File must be an audio file" }, { status: 400 })
    }

    const id = `custom-${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    const storagePath = `${id}.mp3`
    const buffer = Buffer.from(await file.arrayBuffer())

    await uploadBuffer(AUDIO_BUCKET, storagePath, buffer, "audio/mpeg")

    const track = await prisma.audioTrack.create({
      data: {
        id,
        name,
        storagePath,
        mood,
        genre,
        bpm,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        description,
      },
    })

    return NextResponse.json({
      track: {
        id: track.id,
        name: track.name,
        file: getPublicUrl(AUDIO_BUCKET, track.storagePath),
        filename: track.storagePath,
        mood: track.mood,
        genre: track.genre,
        bpm: track.bpm,
        tags: track.tags,
        description: track.description,
        custom: true,
        available: true,
      },
    })
  } catch (error) {
    console.error("Audio track upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

export async function PATCH(request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id, hidden } = await request.json()
    if (!id) return NextResponse.json({ error: "Track ID required" }, { status: 400 })

    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } })
    let hiddenTracks = settings?.hiddenTracks || []

    if (hidden) {
      if (!hiddenTracks.includes(id)) hiddenTracks = [...hiddenTracks, id]
    } else {
      hiddenTracks = hiddenTracks.filter((t) => t !== id)
    }

    await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: { hiddenTracks },
      create: { id: 1, hiddenTracks },
    })

    return NextResponse.json({ id, hidden })
  } catch (error) {
    console.error("Audio track toggle error:", error)
    return NextResponse.json({ error: "Toggle failed" }, { status: 500 })
  }
}

export async function DELETE(request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: "Track ID required" }, { status: 400 })

    const track = await prisma.audioTrack.findUnique({ where: { id } })
    if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 })

    await deletePaths(AUDIO_BUCKET, [track.storagePath])
    await prisma.audioTrack.delete({ where: { id } })

    return NextResponse.json({ deleted: id })
  } catch (error) {
    console.error("Audio track delete error:", error)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
