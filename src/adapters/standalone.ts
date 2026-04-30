/**
 * @file adapters/standalone.ts
 * @description Standalone HTTP server adapter for BrandKit MCP.
 * Runs the MCP server with SSE transport on a plain Node.js HTTP server
 * without any framework dependencies beyond the MCP SDK.
 */

import { createServer } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { loadConfig, resolveConfigPaths } from '../config/loader.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { registerAllTools } from '../tools/index.js';
import type { DesignSystemIndex } from '../indexer/types.js';

/**
 * Starts a standalone HTTP server with SSE transport.
 * @param port - Port to listen on (default: 3001)
 * @param configPath - Optional path to brandkit.config.yaml
 */
export async function startStandaloneServer(port: number = 3001, configPath?: string): Promise<void> {
  const rawConfig = loadConfig(configPath);
  const config = resolveConfigPaths(rawConfig, process.cwd());
  const index = await buildDesignSystemIndex(config);

  const mcpServer = new Server(
    { name: 'brandkit-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerAllTools(mcpServer, () => index);

  let sseTransport: SSEServerTransport | null = null;

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', assets: index.resolved.all.assetInventory.totalFiles }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sse') {
      sseTransport = new SSEServerTransport('/messages', res as never);
      await mcpServer.connect(sseTransport);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      if (sseTransport) {
        await sseTransport.handlePostMessage(req as never, res as never);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active SSE connection' }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  httpServer.listen(port, () => {
    console.error(`[brandkit-mcp] Standalone server running at http://localhost:${port}`);
    console.error(`[brandkit-mcp] SSE endpoint: http://localhost:${port}/sse`);
    console.error(`[brandkit-mcp] Health check: http://localhost:${port}/health`);
  });
}

// Auto-start when run directly
if (process.argv[1]?.includes('standalone')) {
  const port = parseInt(process.env.PORT ?? '3001', 10);
  startStandaloneServer(port).catch(console.error);
}

