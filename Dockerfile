FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src/ ./src/
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist/ ./dist/
COPY brand/ ./brand/
COPY brandkit.config.yaml ./
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/cli/index.js", "serve", "--transport", "sse", "--port", "3001"]

