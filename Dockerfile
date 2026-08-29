FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsup.config.ts ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV BRANDKIT_CONFIG=/app/docker/brandkit.config.yaml

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/preview/templates ./src/preview/templates
COPY --from=builder /app/src/preview/static ./src/preview/static

RUN mkdir -p /app/docker && chown node:node /app/docker
COPY --chown=node:node examples/acme-corp/brand_atomic_system/ /app/examples/acme-corp/brand_atomic_system/
COPY --chown=node:node docker/brandkit.config.yaml /app/docker/brandkit.config.yaml

USER node
EXPOSE 3001
CMD ["node", "/app/dist/cli/index.js", "serve", "--transport", "http", "--host", "0.0.0.0", "--port", "3001"]
