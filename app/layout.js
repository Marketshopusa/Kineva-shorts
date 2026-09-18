import { Inter } from "next/font/google"
import ThemeProvider from "@/components/ThemeProvider"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata = {
  applicationName: "Kineva",
  title: "Kineva — Series dramáticas cortas con IA",
  description: "Genera series dramáticas verticales 9:16: guion, stills, voces y exportación. Identidad de producto propia sobre base técnica open source.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/logo.svg" }],
    apple: "/logo.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Kineva — Series dramáticas cortas con IA",
    description: "Plataforma de drama corto y storytelling audiovisual con IA.",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://kineva.app",
    siteName: "Kineva",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kineva — Series dramáticas cortas con IA",
    description: "Plataforma de drama corto y storytelling audiovisual con IA.",
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-text-primary antialiased font-sans" suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
