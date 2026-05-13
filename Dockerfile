FROM node:20-alpine AS builder
WORKDIR /app
COPY client/ ./client/
WORKDIR /app/client
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY server/ ./server/
WORKDIR /app/server
RUN npm ci --omit=dev
COPY --from=builder /app/client/dist ./public
ENV STATIC_DIR=./public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
