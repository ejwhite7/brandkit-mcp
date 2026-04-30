/**
 * @file index.ts
 * @description Main entry point for the BrandKit MCP server.
 *
 * Creates and starts the MCP server with support for both stdio and SSE
 * transports. Loads the brand configuration, builds the design system index,
 * registers all 12 MCP tools, and optionally starts a file watcher for
 * hot-reload during development.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, resolveConfigPaths } from './config/loader.js';
import { buildDesignSystemIndex } from './indexer/index.js';
import { registerAllTools } from './tools/index.js';
import { watchBrandDirectory } from './indexer/hot-reload.js';
import type { DesignSystemIndex } from './indexer/types.js';

/** Current design system index -- updated on hot-reload. */
let currentIndex: DesignSystemIndex;

/**
 * Starts the BrandKit MCP server.
 * @param options - CLI options (transport, port, config path, watch mode)
 */
export async function startServer(options: {
  transport?: 'stdio' | 'sse';
  port?: number;
  configPath?: string;
  watch?: boolean;
} = {}): Promise<void> {
  const transport = options.transport ?? 'stdio';

  // Log to stderr (stdout is reserved for MCP protocol in stdio mode)
  console.error('[brandkit-mcp] Starting server...');

  // Load and resolve config
  const rawConfig = loadConfig(options.configPath);
  const config = resolveConfigPaths(rawConfig, process.cwd());
  console.error(`[brandkit-mcp] Loaded config for "${config.name}"`);

  // Build initial design system index
  console.error('[brandkit-mcp] Building design system index...');
  const startTime = Date.now();
  currentIndex = await buildDesignSystemIndex(config);
  const elapsed = Date.now() - startTime;
  console.error(`[brandkit-mcp] Indexed ${currentIndex.resolved.all.assetInventory.totalFiles} assets in ${elapsed}ms`);

  // Create MCP server
  const server = new Server(
    { name: 'brandkit-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // Register all tools
  registerAllTools(server, () => currentIndex);

  // Start file watcher if requested
  if (options.watch) {
    console.error('[brandkit-mcp] File watching enabled');
    watchBrandDirectory(config, (newIndex) => {
      currentIndex = newIndex;
      console.error(`[brandkit-mcp] Index updated: ${newIndex.resolved.all.assetInventory.totalFiles} assets`);
    });
  }

  // Connect transport
  if (transport === 'stdio') {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('[brandkit-mcp] Server running on stdio');
  } else {
    // SSE transport via Express
    const express = (await import('express')).default;
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    const app = express();
    const port = options.port ?? config.server.port ?? 3001;

    let sseTransport: InstanceType<typeof SSEServerTransport> | null = null;

    app.get('/sse', async (req, res) => {
      sseTransport = new SSEServerTransport('/messages', res);
      await server.connect(sseTransport);
    });

    app.post('/messages', async (req, res) => {
      if (sseTransport) {
        await sseTransport.handlePostMessage(req, res);
      } else {
        res.status(400).json({ error: 'No active SSE connection' });
      }
    });

    app.listen(port, () => {
      console.error(`[brandkit-mcp] SSE server running at http://localhost:${port}`);
      console.error(`[brandkit-mcp] Connect via SSE at http://localhost:${port}/sse`);
    });
  }
}

// Auto-start when run directly
const isDirectRun = process.argv[1]?.includes('index');
if (isDirectRun && !process.argv[1]?.includes('cli')) {
  startServer().catch((err) => {
    console.error('[brandkit-mcp] Fatal error:', err);
    process.exit(1);
  });
}

