import pg from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis

function withPoolerTls(url) {
  if (!url) return url
  if (/sslmode=/i.test(url)) return url.replace(/sslmode=[^&]*/i, "sslmode=no-verify")
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=no-verify`
}

function createPrismaClient() {
  const connectionString = withPoolerTls(
    process.env.DATABASE_URL || "postgresql://scenarix:scenarix@127.0.0.1:5432/scenarix",
  )
  const pool = new pg.Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export default prisma
