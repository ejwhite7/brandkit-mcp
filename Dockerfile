# Builder stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json tsup.config.ts ./
RUN npm install
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/preview/templates ./src/preview/templates
COPY --from=builder /app/src/preview/static ./src/preview/static
COPY brand/ ./brand/
COPY brandkit.config.yaml ./
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/cli/index.js", "serve", "--transport", "sse", "--port", "3001"]
