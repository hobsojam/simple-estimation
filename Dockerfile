FROM node:26-alpine AS builder
WORKDIR /app/client
COPY client/ .
RUN npm ci && npm run build

FROM node:26-alpine AS runner
USER node
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=builder /app/client/dist ./public
EXPOSE 3000
CMD ["node", "index.js"]
