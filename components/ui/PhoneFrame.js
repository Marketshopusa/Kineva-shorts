"use client"

export default function PhoneFrame({ children }) {
  return (
    <div className="relative mx-auto" style={{ width: 280, height: 560 }}>
      {/* Phone bezel */}
      <div className="absolute inset-0 bg-zinc-900 rounded-[2.5rem] border-2 border-zinc-700 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-zinc-900 rounded-b-2xl z-10" />

        {/* Screen area */}
        <div className="absolute top-3 left-3 right-3 bottom-3 rounded-[2rem] overflow-hidden bg-black">
          {children}
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-zinc-600 rounded-full" />
      </div>
    </div>
  )
}
