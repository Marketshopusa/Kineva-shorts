/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  compress: true,
  env: {
    NEXT_PUBLIC_KINEVA_BUILD_SHA: (
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_KINEVA_BUILD_SHA ||
      ""
    ).slice(0, 7),
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "*.trycloudflare.com",
    "choosing-nebraska-out-features.trycloudflare.com",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/cli",
    "remotion",
    "@remotion/player",
    "prisma",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "bcryptjs",
    "@anthropic-ai/sdk",
    "@google/genai",
    "@google/generative-ai",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
}

export default nextConfig
