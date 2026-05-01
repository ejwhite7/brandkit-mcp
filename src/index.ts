/**
 * @file index.ts
 * @description Main entry point for the BrandKit MCP server.
 *
 * Creates and starts the MCP server with stdio, SSE, or Streamable HTTP
 * transport. Loads the brand configuration, builds the design system index,
 * registers all MCP tools / resources / prompts, and optionally starts a
 * file watcher for hot-reload during development.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, resolveConfigPaths } from './config/loader.js';
import { buildDesignSystemIndex } from './indexer/index.js';
import { registerAllTools } from './tools/index.js';
import { watchBrandDirectory } from './indexer/hot-reload.js';
import type { DesignSystemIndex } from './indexer/types.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/** Current design system index -- updated on hot-reload. */
let currentIndex: DesignSystemIndex;

export type Transport = 'stdio' | 'sse' | 'http';

export interface StartServerOptions {
  transport?: Transport;
  port?: number;
  configPath?: string;
  watch?: boolean;
}

/**
 * Starts the BrandKit MCP server.
 */
export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const transport = options.transport ?? 'stdio';

  // Log to stderr (stdout is reserved for MCP protocol in stdio mode)
  console.error('[brandkit-mcp] Starting server...');

  const rawConfig = loadConfig(options.configPath);
  const configDir = options.configPath
    ? dirname(resolve(options.configPath))
    : process.cwd();
  const config = resolveConfigPaths(rawConfig, configDir);
  console.error(`[brandkit-mcp] Loaded config for "${config.name}"`);

  console.error('[brandkit-mcp] Building design system index...');
  const startTime = Date.now();
  currentIndex = await buildDesignSystemIndex(config);
  const elapsed = Date.now() - startTime;
  console.error(`[brandkit-mcp] Indexed ${currentIndex.resolved.all.assetInventory.totalFiles} assets in ${elapsed}ms`);

  const server = new Server(
    { name: 'brandkit-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  registerAllTools(server, () => currentIndex);

  if (options.watch) {
    console.error('[brandkit-mcp] File watching enabled');
    watchBrandDirectory(config, (newIndex) => {
      currentIndex = newIndex;
      console.error(`[brandkit-mcp] Index updated: ${newIndex.resolved.all.assetInventory.totalFiles} assets`);
    });
  }

  if (transport === 'stdio') {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('[brandkit-mcp] Server running on stdio');
    return;
  }

  // HTTP-based transports
  const express = (await import('express')).default;
  const app = express();
  const port = options.port ?? config.server.port ?? 3001;

  if (transport === 'sse') {
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    // Map per-session-id -> transport so multiple clients can connect.
    const sessions = new Map<string, InstanceType<typeof SSEServerTransport>>();

    app.get('/sse', async (_req, res) => {
      const t = new SSEServerTransport('/messages', res);
      sessions.set(t.sessionId, t);
      res.on('close', () => sessions.delete(t.sessionId));
      await server.connect(t);
    });

    app.post('/messages', async (req, res) => {
      const sessionId = (req.query.sessionId as string) ?? '';
      const t = sessions.get(sessionId);
      if (!t) {
        res.status(400).json({ error: 'No active SSE session for sessionId' });
        return;
      }
      await t.handlePostMessage(req, res);
    });

    app.listen(port, () => {
      console.error(`[brandkit-mcp] SSE server running at http://localhost:${port}`);
      console.error(`[brandkit-mcp] Connect via SSE at http://localhost:${port}/sse`);
    });
    return;
  }

  if (transport === 'http') {
    // Streamable HTTP transport (MCP spec 2025-03-26)
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    app.use(express.json());

    const httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: simpler for single-tenant brand servers
    });
    await server.connect(httpTransport);

    app.all('/mcp', async (req, res) => {
      await httpTransport.handleRequest(req, res, req.body);
    });

    app.listen(port, () => {
      console.error(`[brandkit-mcp] Streamable HTTP server running at http://localhost:${port}/mcp`);
    });
    return;
  }

  throw new Error(`Unknown transport: ${transport}`);
}

// Auto-start when this file is the direct entry point (e.g. `node dist/index.js`).
const isDirectRun = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  startServer().catch((err) => {
    console.error('[brandkit-mcp] Fatal error:', err);
    process.exit(1);
  });
}
