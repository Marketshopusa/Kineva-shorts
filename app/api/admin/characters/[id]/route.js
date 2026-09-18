export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

const ALLOWED_CHARACTER_FIELDS = ["name", "role", "appearance", "personality"]

function pick(obj, keys) {
  const result = {}
  for (const key of keys) {
    if (key in obj) result[key] = obj[key]
  }
  return result
}

export async function PUT(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const data = pick(body, ALLOWED_CHARACTER_FIELDS)

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 })
    }

    const character = await prisma.character.update({
      where: { id: parseInt(id) },
      data,
    })

    return Response.json(character)
  } catch (error) {
    console.error("Character PUT error:", error)
    return Response.json({ error: "Failed to update character" }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const session = await requireAdmin()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    await prisma.character.delete({
      where: { id: parseInt(id) },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error("Character DELETE error:", error)
    return Response.json({ error: "Failed to delete character" }, { status: 500 })
  }
}
