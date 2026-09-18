export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { signAdminToken, setAdminCookie } from "@/lib/admin-auth"
import { cookies } from "next/headers"

function matchesEnvCredentials(email, password) {
  const envEmail = process.env.ADMIN_EMAIL
  const envPassword = process.env.ADMIN_PASSWORD
  return envEmail && envPassword && email === envEmail && password === envPassword
}

export async function POST(request) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 })
    }

    let user = null

    // Try database lookup first
    try {
      user = await prisma.user.findUnique({ where: { email } })
    } catch {
      // DB unavailable — fall through to env check
    }

    if (user) {
      const valid = await bcrypt.compare(password, user.password)
      if (!valid) {
        return Response.json({ error: "Invalid email or password" }, { status: 401 })
      }
    } else if (matchesEnvCredentials(email, password)) {
      // Env credentials match — try to persist the user in DB
      try {
        const hash = await bcrypt.hash(password, 12)
        user = await prisma.user.create({
          data: { email, password: hash, name: "Admin" },
        })
      } catch {
        // DB unavailable — create a virtual user for the session
        user = { id: 0, email, name: "Admin" }
      }
    } else {
      return Response.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const token = await signAdminToken(user)
    const cookieStore = await cookies()
    cookieStore.set(setAdminCookie(token))

    return Response.json({ id: user.id, email: user.email, name: user.name })
  } catch (error) {
    console.error("Admin login error:", error)
    return Response.json({ error: "Login failed" }, { status: 500 })
  }
}
