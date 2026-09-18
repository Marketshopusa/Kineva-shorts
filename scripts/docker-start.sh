#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding admin user..."
node prisma/seed.mjs

echo "Linking uploads into standalone dir..."
ln -sfn /app/uploads /app/.next/standalone/uploads

echo "Starting Next.js..."
exec node .next/standalone/server.js
