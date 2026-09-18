# ─── Base ────────────────────────────────────────────────────
FROM node:20-bookworm

COPY requirements-tts.txt /tmp/requirements-tts.txt

RUN apt-get update && apt-get install -y \
    chromium \
    python3 \
    python3-pip \
    ffmpeg \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    --no-install-recommends && \
    pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements-tts.txt && \
    rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
# Install ALL deps (including devDeps like tailwindcss) needed for the build
RUN npm ci --include=dev

COPY . .
RUN npx prisma generate
# Use webpack (same as dev) to avoid Turbopack issues; set NODE_ENV only for build
RUN NODE_ENV=production NODE_OPTIONS='--max-old-space-size=4096' npx next build --webpack

# Copy public assets and static files into the standalone output so the
# standalone server can serve them without a separate CDN or nginx mapping.
RUN cp -r public .next/standalone/public && \
    cp -r .next/static .next/standalone/.next/static && \
    cp -r remotion/. .next/standalone/remotion/ && \
    cp -r lib/. .next/standalone/lib/ && \
    cp -r node_modules/@remotion/. .next/standalone/node_modules/@remotion/

ENV NODE_ENV=production

EXPOSE 3000
CMD ["sh", "scripts/docker-start.sh"]
