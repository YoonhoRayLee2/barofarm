# ── stage 1: builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── stage 2: runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/public ./public
COPY --from=builder /build/db ./db

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
