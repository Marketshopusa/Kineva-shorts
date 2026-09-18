"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

export default function Breadcrumb({ items }) {
  if (!items?.length) return null

  return (
    <nav className="flex items-center gap-1.5 text-sm text-text-muted mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-muted/50" />}
          {i < items.length - 1 ? (
            <Link
              href={item.href}
              className="hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-text-primary font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
