# ── Stage 1: Build the application ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source files
COPY . .

# Build the production Nitro server and client assets
RUN npm run build

# ── Stage 2: Runtime environment ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Configure production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy the compiled production output containing the Nitro server and assets
COPY --from=builder /app/.output /app/.output

# Expose Nitro's serving port
EXPOSE 3000

# Run under the pre-existing non-privileged 'node' user for security
USER node

# Launch the production Nitro server
CMD ["node", ".output/server/index.mjs"]
