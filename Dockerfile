# syntax=docker/dockerfile:1
# Oryn self-hosted image: Next standalone + Debian ffmpeg + bundled subtitle font; data lives on the /data volume.
# One-command self-hosting:
#   docker run -d -p 3000:3000 -v oryn-data:/data ghcr.io/slothrulez/oryn:latest
# then open http://localhost:3000 in a browser — videos work with no key (free stock + Edge TTS).

# the apt mirror host can be overridden with --build-arg APT_MIRROR=<mirror host>; defaults to the official mirror.
# keep http: apt verifies integrity with GPG signatures, and bookworm-slim has no ca-certificates, so https would break.
ARG APT_MIRROR=deb.debian.org

# ---- build stage ----
FROM node:22-bookworm-slim AS builder
ARG APT_MIRROR
WORKDIR /app
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources
# better-sqlite3 is a native module and needs a build toolchain (-o Acquire::Retries guards against occasional mirror 5xx)
RUN apt-get update && apt-get install -y --no-install-recommends -o Acquire::Retries=5 python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# the container only runs the web app; skip the Electron binary download to speed up installs
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime stage ----
FROM node:22-bookworm-slim AS runner
ARG APT_MIRROR
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg/ffprobe come from Debian packages (the app falls back to ffmpeg on PATH when FFMPEG_PATH is unset).
# The ffmpeg-static npm package's linux static binary can't be used: johnvansickle's FFmpeg 7.x build lacks harfbuzz,
# so the drawtext filter doesn't exist at all (No such filter: 'drawtext'), and burned captions/price tags/covers/carousels/end cards depend on
# drawtext — using it would break every text composite in Docker deployments. The Debian build has harfbuzz/freetype/fontconfig
# and every filter the pipeline uses (drawtext/xfade/zoompan/subtitles/ass/loudnorm etc.).
# No system font package needed: public/fonts/subtitle.ttf is bundled and resolveSubtitleFontFile prefers it.
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get update && apt-get install -y --no-install-recommends -o Acquire::Retries=5 ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -hide_banner -filters 2>/dev/null | grep -q ' drawtext ' \
  || (echo "FATAL: ffmpeg lacks the drawtext filter — subtitle/text composition would break" && exit 1)
# Next standalone output (minimal server.js + required node_modules, including the externalized better-sqlite3)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# drizzle migrations (read at runtime, not traced by nft, so copy them explicitly)
COPY --from=builder /app/drizzle ./drizzle
# data (sqlite + uploads + output) goes on a writable volume for persistence
ENV APP_DATA_DIR=/data
RUN mkdir -p /data
VOLUME /data
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "server.js"]
