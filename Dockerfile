FROM node:26-alpine AS builder
WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
COPY shared/ ./shared/
RUN cd client && npm run build

FROM node:26-alpine AS runner
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server/ ./
COPY --chown=node:node shared/ ../shared/
COPY --from=builder --chown=node:node /app/client/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "index.js"]
