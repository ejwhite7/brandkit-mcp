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
import {
  createNetworkAuthPolicy,
  createNetworkRequestPolicy,
  configureHttpServerLimits,
  formatHostForUrl,
  getDistinctRequestHeader,
  NetworkBodyTooLargeError,
  NetworkInvalidJsonError,
  NetworkRequestTimeoutError,
  readBoundedJsonBody,
  type NetworkResourceLimits,
  resolveNetworkLimits,
  withRequestTimeout,
} from '../network.js';

/**
 * Starts a standalone HTTP server with SSE transport.
 * @param port - Optional port override (config default: 3001; pass 0 for an ephemeral port)
 * @param configPath - Optional path to brandkit.config.yaml
 * @param host - Optional host override (config default: 127.0.0.1)
 * @param authToken - Optional programmatic Bearer token override
 * @param allowWriteTools - Explicitly expose write-capable tools (default: false)
 * @param networkLimits - Optional finite network limits for embedders and tests
 * @returns The listening http.Server (caller may close() it)
 */
export async function startStandaloneServer(
  port?: number,
  configPath?: string,
  host?: string,
  authToken?: string,
  allowWriteTools = false,
  networkLimits: Partial<NetworkResourceLimits> = {},
): Promise<HttpServer> {
  // Resolve relative paths against the config file's own directory (same
  // portability fix as startServer in src/index.ts).
  const { config: rawConfig, filePath, fileIdentity } = loadConfigWithPath(configPath);
  const configDir = dirname(filePath);
  const config = resolveConfigPaths(rawConfig, configDir);
  const listenPort = port ?? config.server.port;
  const listenHost = host ?? config.server.host;
  const urlHost = formatHostForUrl(listenHost);
  const authPolicy = createNetworkAuthPolicy(listenHost, authToken);
  const requestPolicy = createNetworkRequestPolicy(
    listenHost,
    listenPort,
    config.server.allowedHosts,
    config.server.allowedOrigins,
  );
  const limits = resolveNetworkLimits(networkLimits);
  const index = await buildDesignSystemIndex(config);
  const syncContext = { configPath: filePath, outputDir: configDir, configIdentity: fileIdentity };

  // One transport per connected client, keyed by sessionId.
  const sessions = new Map<string, SSEServerTransport>();
  let activeMessages = 0;

  const httpServer = createServer(async (req, res) => {
    let requestSessionId = '';
    let requestTransport: SSEServerTransport | undefined;
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (!requestPolicy.validate(
        getDistinctRequestHeader(req, 'host'),
        getDistinctRequestHeader(req, 'origin'),
      )) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }

      if (!authPolicy.authorize(req.headers.authorization)) {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer',
        });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ status: 'ready' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sse') {
        if (sessions.size >= limits.maxSseSessions) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Server is at session capacity',
            code: 'session_capacity',
          }));
          return;
        }
        // The MCP SDK allows one transport per Server instance, so each SSE
        // connection gets its own Server sharing the index via closure.
        const sessionServer = new Server(
          { name: 'brandkit-mcp', version: getPackageVersion() },
          { capabilities: { tools: {}, resources: {}, prompts: {} } },
        );
        registerAllTools(
          sessionServer,
          () => index,
          syncContext,
          { allowWriteTools },
        );
        const transport = new SSEServerTransport(
          '/messages',
          res,
          requestPolicy.sdkDnsRebindingOptions,
        );
        sessions.set(transport.sessionId, transport);
        res.on('close', () => {
          sessions.delete(transport.sessionId);
          void sessionServer.close().catch(() => {
            console.error('[brandkit-mcp] Standalone SSE session cleanup error');
          });
        });
        await sessionServer.connect(transport);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/messages') {
        if (activeMessages >= limits.maxConcurrentRequests) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Server is at request capacity',
            code: 'request_capacity',
          }));
          return;
        }
        requestSessionId = url.searchParams.get('sessionId') ?? '';
        requestTransport = sessions.get(requestSessionId);
        if (requestTransport) {
          activeMessages += 1;
          try {
            const body = await withRequestTimeout(
              readBoundedJsonBody(req, limits.jsonBodyBytes),
              limits.requestTimeoutMs,
            );
            await withRequestTimeout(
              requestTransport.handlePostMessage(req, res, body),
              limits.requestTimeoutMs,
            );
          } finally {
            activeMessages -= 1;
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active SSE session for sessionId' }));
        }
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (error) {
      console.error('[brandkit-mcp] Standalone request handler error');
      if (!res.headersSent) {
        const timedOut = error instanceof NetworkRequestTimeoutError;
        const tooLarge = error instanceof NetworkBodyTooLargeError;
        const invalidJson = error instanceof NetworkInvalidJsonError;
        res.writeHead(tooLarge ? 413 : invalidJson ? 400 : timedOut ? 504 : 500, {
          'Content-Type': 'application/json',
          ...(tooLarge ? { Connection: 'close' } : {}),
        });
        res.end(JSON.stringify({
          error: tooLarge
            ? 'Request body too large'
            : invalidJson
              ? 'Invalid JSON'
              : timedOut ? 'Request timed out' : 'Internal server error',
          code: tooLarge
            ? 'body_too_large'
            : invalidJson
              ? 'invalid_json'
              : timedOut ? 'request_timeout' : 'internal_error',
        }));
        if (timedOut) {
          sessions.delete(requestSessionId);
          void requestTransport?.close().catch(() => {
            console.error('[brandkit-mcp] Timed-out standalone SSE cleanup error');
          });
        }
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });
  configureHttpServerLimits(httpServer, limits);

  await new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(listenPort, listenHost, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : listenPort;
      console.error(`[brandkit-mcp] Standalone server running at http://${urlHost}:${actualPort}`);
      console.error(`[brandkit-mcp] SSE endpoint: http://${urlHost}:${actualPort}/sse`);
      console.error(`[brandkit-mcp] Health check: http://${urlHost}:${actualPort}/health`);
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
  const parsed = process.env.PORT === undefined ? undefined : parseInt(process.env.PORT, 10);
  const port = parsed !== undefined && Number.isNaN(parsed) ? undefined : parsed;
  startStandaloneServer(port, undefined, process.env.HOST).catch(console.error);
}
