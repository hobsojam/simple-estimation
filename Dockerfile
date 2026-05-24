FROM node:26-alpine AS builder
WORKDIR /app/client
COPY client/ .
RUN npm ci && npm run build

FROM node:26-alpine AS runner
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server/ ./
COPY --from=builder --chown=node:node /app/client/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "index.js"]
