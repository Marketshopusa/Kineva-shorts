"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import { LayoutDashboard, Settings, LogOut } from "lucide-react"
import ThemeToggle from "@/components/ThemeToggle"
import Logo from "@/components/Logo"

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState(null)

  async function handleLogout() {
    await fetch("/api/admin-logout", { method: "POST" })
    router.push("/admin/login")
  }

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.logoUrl) setLogoUrl(data.logoUrl)
      })
      .catch(() => {})
  }, [])

  const navLinks = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ]

  return (
    <nav className="sticky top-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2.5 group">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-7 max-w-28 object-contain" />
          ) : (
            <Logo size={24} />
          )}
          <span className="text-lg font-bold tracking-widest text-brand group-hover:text-accent transition-colors">
            KINEVA
          </span>
          {process.env.NEXT_PUBLIC_KINEVA_BUILD_SHA ? (
            <span className="hidden sm:inline text-[10px] text-text-muted font-mono tracking-normal font-normal">
              Build: {process.env.NEXT_PUBLIC_KINEVA_BUILD_SHA}
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-1 text-sm">
          {navLinks
            .filter((link) => link.href !== pathname)
            .map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted hover-text rounded-lg hover:bg-overlay-strong transition-all"
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              )
            })}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted hover-text rounded-lg hover:bg-overlay-strong transition-all btn-press ml-1"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
