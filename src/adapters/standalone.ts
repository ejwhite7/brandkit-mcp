/**
 * @file adapters/standalone.ts
 * @description Standalone HTTP server adapter for BrandKit MCP.
 * Runs the MCP server with SSE transport on a plain Node.js HTTP server
 * without any framework dependencies beyond the MCP SDK.
 * Each SSE client gets its own MCP Server instance (the SDK allows exactly
 * one transport per Server). Transports are tracked per sessionId so multiple
 * clients can connect concurrently (mirrors the express SSE path in src/index.ts).
 */

import { createServer, type Server as HttpServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { loadConfigWithPath, resolveConfigPaths } from '../config/loader.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { registerAllTools } from '../tools/index.js';
import { getPackageVersion } from '../version.js';

/**
 * Starts a standalone HTTP server with SSE transport.
 * @param port - Port to listen on (default: 3001; pass 0 for an ephemeral port)
 * @param configPath - Optional path to brandkit.config.yaml
 * @returns The listening http.Server (caller may close() it)
 */
export async function startStandaloneServer(
  port: number = 3001,
  configPath?: string,
): Promise<HttpServer> {
  // Resolve relative paths against the config file's own directory (same
  // portability fix as startServer in src/index.ts).
  const { config: rawConfig, filePath } = loadConfigWithPath(configPath);
  const config = resolveConfigPaths(rawConfig, dirname(filePath));
  const index = await buildDesignSystemIndex(config);

  // One transport per connected client, keyed by sessionId.
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', assets: index.base.tokens.length + index.base.components.length + index.base.assets.length }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sse') {
        // The MCP SDK allows one transport per Server instance, so each SSE
        // connection gets its own Server sharing the index via closure.
        const sessionServer = new Server(
          { name: 'brandkit-mcp', version: getPackageVersion() },
          { capabilities: { tools: {}, resources: {}, prompts: {} } },
        );
        registerAllTools(sessionServer, () => index);
        const transport = new SSEServerTransport('/messages', res);
        sessions.set(transport.sessionId, transport);
        res.on('close', () => sessions.delete(transport.sessionId));
        await sessionServer.connect(transport);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/messages') {
        const sessionId = url.searchParams.get('sessionId') ?? '';
        const transport = sessions.get(sessionId);
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active SSE session for sessionId' }));
        }
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      console.error('[brandkit-mcp] Request handler error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      console.error(`[brandkit-mcp] Standalone server running at http://localhost:${actualPort}`);
      console.error(`[brandkit-mcp] SSE endpoint: http://localhost:${actualPort}/sse`);
      console.error(`[brandkit-mcp] Health check: http://localhost:${actualPort}/health`);
      resolveListen();
    });
  });

  return httpServer;
}

// Auto-start only when this file is the direct entry point.
const isDirectRun = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  const parsed = parseInt(process.env.PORT ?? '3001', 10);
  const port = Number.isNaN(parsed) ? 3001 : parsed;
  startStandaloneServer(port).catch(console.error);
}
