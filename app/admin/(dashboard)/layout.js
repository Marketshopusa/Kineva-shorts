"use client"

import Navbar from "@/components/Navbar"

export default function AdminLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
    </>
  )
}
