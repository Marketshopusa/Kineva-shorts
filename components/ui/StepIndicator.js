"use client"

import { Check } from "lucide-react"

export default function StepIndicator({ steps, currentStep, onStepClick }) {
  return (
    <div className="flex items-center w-full mb-6">
      {steps.map((name, i) => {
        const isCompleted = i < currentStep
        const isCurrent = i === currentStep
        const isFuture = i > currentStep

        return (
          <div key={name} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <button
              onClick={() => isCompleted && onStepClick(i)}
              disabled={isFuture}
              className="flex flex-col items-center gap-1.5 group relative"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isCompleted
                    ? "bg-accent text-white cursor-pointer group-hover:bg-accent-hover btn-press"
                    : isCurrent
                      ? "bg-accent text-white ring-4 ring-accent/20 shadow-[0_0_12px_rgba(229,9,20,0.2)]"
                      : "bg-input-bg text-text-muted border border-card-border cursor-not-allowed"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap hidden sm:block ${
                  isCurrent ? "text-accent" : isCompleted ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {name}
              </span>
            </button>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2">
                <div
                  className={`h-0.5 w-full transition-colors ${
                    isCompleted ? "bg-accent" : "bg-card-border"
                  }`}
                  style={isFuture ? { backgroundImage: "repeating-linear-gradient(90deg, var(--brd-h) 0, var(--brd-h) 4px, transparent 4px, transparent 8px)" } : undefined}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
