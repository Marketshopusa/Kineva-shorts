import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const COOKIE_NAME = "admin-token"

function getSecret() {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("Missing AUTH_SECRET or NEXTAUTH_SECRET environment variable")
  return new TextEncoder().encode(s)
}

export async function signAdminToken(user) {
  return new SignJWT({ userId: String(user.id), email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret())
}

export async function verifyAdminToken() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return { userId: payload.userId, email: payload.email }
  } catch {
    return null
  }
}

export function setAdminCookie(token) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    // HTTPS tunnels (e.g. trycloudflare) reject/ignore non-Secure cookies in Chrome.
    secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1",
    sameSite: process.env.COOKIE_SECURE === "1" ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  }
}

export function clearAdminCookie() {
  return { name: COOKIE_NAME, value: "", httpOnly: true, path: "/", maxAge: 0 }
}
