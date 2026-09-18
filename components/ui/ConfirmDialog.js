"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

/**
 * Styled confirmation dialog.
 *
 * Props:
 *   open        – boolean, controls visibility
 *   title       – dialog heading (e.g. "Delete Episode")
 *   message     – body text (e.g. "This will permanently delete …")
 *   confirmLabel – button label (default "Delete")
 *   danger      – boolean, makes confirm button red (default true)
 *   onConfirm   – called when user clicks confirm
 *   onCancel    – called when user clicks cancel or presses Escape
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onCancel,
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === "Escape") onCancel?.()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-sm mx-4 bg-surface border border-border rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/15 mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-center text-text-primary mb-2">{title}</h2>

        {/* Message */}
        {message && (
          <p className="text-sm text-text-muted text-center mb-6">{message}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-muted hover:text-text-primary hover:border-text-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
