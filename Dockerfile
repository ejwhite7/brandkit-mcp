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
# Bundle the acme-corp example as the default demo brand so the container
# has a working brand directory out of the box (used by Glama for
# introspection and by `npx brandkit-mcp serve` demos).
COPY examples/acme-corp/brand/ ./brand/
COPY examples/acme-corp/brandkit.config.yaml ./
ENV NODE_ENV=production
# Default to stdio transport so the container works out-of-the-box with
# MCP stdio clients (Claude Desktop, Glama mcp-proxy, etc.). To run as an
# SSE/HTTP server instead, override CMD, e.g.:
#   docker run -p 3001:3001 brandkit-mcp \
#     node dist/cli/index.js serve --transport sse --port 3001
CMD ["node", "dist/cli/index.js", "serve", "--transport", "stdio"]
