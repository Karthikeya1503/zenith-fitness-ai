# ═══════════════════════════════════════════════════
# FitCoach AI — Multi-stage Production Dockerfile
# Optimized for Pterodactyl Panel & generic Docker hosts
# ═══════════════════════════════════════════════════

# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (Docker layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ──
FROM node:20-alpine AS runner

WORKDIR /app

# Install a lightweight static server
RUN npm install -g serve@14

# Copy only the built output
COPY --from=builder /app/dist ./dist

# Pterodactyl expects to bind to a configurable port (default: 3000)
ENV PORT=3000
EXPOSE ${PORT}

# Health check for orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/ || exit 1

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
