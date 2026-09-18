import { NextResponse } from "next/server"

export function proxy(request) {
  const { pathname } = request.nextUrl

  // Check for auth session token (custom admin-token or legacy next-auth token)
  const token =
    request.cookies.get("admin-token") ||
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token")

  // Protect /admin routes — redirect to /admin/login if no session
  // But exclude the login page itself to avoid redirect loop
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !token) {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }

  // If logged in and visiting /admin/login, redirect to /admin
  if (pathname === "/admin/login" && token) {
    return NextResponse.redirect(new URL("/admin", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
