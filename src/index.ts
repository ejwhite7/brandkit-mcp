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
import { loadConfigWithPath, resolveConfigPaths } from './config/loader.js';
import { buildDesignSystemIndex } from './indexer/index.js';
import { registerAllTools } from './tools/index.js';
import { watchBrandDirectory } from './indexer/hot-reload.js';
import type { DesignSystemIndex } from './indexer/types.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPackageVersion } from './version.js';
import { regenerateBrandDocsIfReady } from './brand-docs/regenerate.js';
import type { Server as HttpServer } from 'http';
import {
  createNetworkAuthPolicy,
  createNetworkRequestPolicy,
  formatHostForUrl,
  getDistinctRequestHeader,
} from './network.js';

/** Current design system index -- updated on hot-reload. */
let currentIndex: DesignSystemIndex;

export type Transport = 'stdio' | 'sse' | 'http';

export interface StartServerOptions {
  transport?: Transport;
  port?: number;
  host?: string;
  configPath?: string;
  watch?: boolean;
  /** Programmatic token injection, primarily for embedders and tests. */
  authToken?: string;
  /** Explicitly expose write-capable tools on network transports. */
  allowWriteTools?: boolean;
}

/** Stdio is the trusted local workflow; network transports require opt-in. */
export function allowWriteToolsForTransport(
  transport: Transport,
  requested = false,
): boolean {
  return transport === 'stdio' || requested;
}

/**
 * Starts the BrandKit MCP server.
 */
export async function startServer(options: StartServerOptions = {}): Promise<void | HttpServer> {
  // Log to stderr (stdout is reserved for MCP protocol in stdio mode)
  console.error('[brandkit-mcp] Starting server...');

  const { config: rawConfig, filePath } = loadConfigWithPath(options.configPath);
  // Always resolve relative paths in the config against the config file's
  // own directory. This makes the server portable across cwd values --
  // e.g. when spawned by mcp-proxy, Claude Desktop, or via Glama, which
  // may set the working directory to something other than the install dir.
  const configDir = dirname(filePath);
  const config = resolveConfigPaths(rawConfig, configDir);
  const transport = options.transport ?? config.server.transport;
  const allowWriteTools = allowWriteToolsForTransport(transport, options.allowWriteTools);
  console.error(`[brandkit-mcp] Loaded config for "${config.brand.name}" from ${filePath}`);

  console.error('[brandkit-mcp] Building design system index...');
  const startTime = Date.now();
  currentIndex = await buildDesignSystemIndex(config);
  const elapsed = Date.now() - startTime;
  console.error(`[brandkit-mcp] Indexed ${currentIndex.base.tokens.length + currentIndex.base.components.length + currentIndex.base.assets.length} assets in ${elapsed}ms`);

  // Regenerate the DESIGN.md / PRODUCT.md reference files for non-MCP coding
  // agents. Written next to brandkit.config.yaml. The MCP never reads these
  // files back as input. Never blocks startup.
  try {
    const result = regenerateBrandDocsIfReady(currentIndex, config.brief, configDir);
    if (result.written) {
      console.error('[brandkit-mcp] Regenerated DESIGN.md and PRODUCT.md');
    } else {
      console.error(
        '[brandkit-mcp] Brief incomplete — run the sync_brand_docs tool to generate DESIGN.md / PRODUCT.md',
      );
    }
  } catch (err) {
    console.error(
      '[brandkit-mcp] Failed to regenerate brand docs:',
      err instanceof Error ? err.message : String(err),
    );
  }

  const server = new Server(
    { name: 'brandkit-mcp', version: getPackageVersion() },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  registerAllTools(
    server,
    () => currentIndex,
    { configPath: filePath, outputDir: configDir },
    { allowWriteTools },
  );

  if (options.watch) {
    console.error('[brandkit-mcp] File watching enabled');
    const stopWatcher = watchBrandDirectory(config, (newIndex) => {
      currentIndex = newIndex;
      console.error(`[brandkit-mcp] Index updated: ${newIndex.base.tokens.length + newIndex.base.components.length + newIndex.base.assets.length} assets`);
    });
    // Close the watcher on shutdown so the process can exit cleanly.
    const shutdown = (signal: NodeJS.Signals) => {
      void stopWatcher().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
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
  const host = options.host ?? config.server.host;
  const urlHost = formatHostForUrl(host);
  const authPolicy = createNetworkAuthPolicy(host, options.authToken);
  const requestPolicy = createNetworkRequestPolicy(
    host,
    port,
    config.server.allowedHosts,
    config.server.allowedOrigins,
  );

  app.use((req, res, next) => {
    if (requestPolicy.validate(
      getDistinctRequestHeader(req, 'host'),
      getDistinctRequestHeader(req, 'origin'),
    )) {
      next();
      return;
    }
    res.status(403).json({ error: 'Forbidden' });
  });

  app.use((req, res, next) => {
    if (authPolicy.authorize(req.headers.authorization)) {
      next();
      return;
    }
    res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Unauthorized' });
  });

  if (transport === 'sse') {
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    // Map per-session-id -> transport so multiple clients can connect.
    const sessions = new Map<string, InstanceType<typeof SSEServerTransport>>();

    app.get('/sse', async (_req, res) => {
      try {
        // The MCP SDK allows one transport per Server instance, so each SSE
        // connection gets its own Server sharing the index via closure.
        const sessionServer = new Server(
          { name: 'brandkit-mcp', version: getPackageVersion() },
          { capabilities: { tools: {}, resources: {}, prompts: {} } },
        );
        registerAllTools(
          sessionServer,
          () => currentIndex,
          { configPath: filePath, outputDir: configDir },
          { allowWriteTools },
        );
        const t = new SSEServerTransport('/messages', res, requestPolicy.sdkDnsRebindingOptions);
        sessions.set(t.sessionId, t);
        res.on('close', () => sessions.delete(t.sessionId));
        await sessionServer.connect(t);
      } catch {
        console.error('[brandkit-mcp] SSE request handler error');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    app.post('/messages', async (req, res) => {
      try {
        const sessionId = (req.query.sessionId as string) ?? '';
        const t = sessions.get(sessionId);
        if (!t) {
          res.status(400).json({ error: 'No active SSE session for sessionId' });
          return;
        }
        await t.handlePostMessage(req, res);
      } catch {
        console.error('[brandkit-mcp] SSE message handler error');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    const httpServer = app.listen(port, host, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      console.error(`[brandkit-mcp] SSE server running at http://${urlHost}:${actualPort}`);
      console.error(`[brandkit-mcp] Connect via SSE at http://${urlHost}:${actualPort}/sse`);
    });
    return httpServer;
  }

  if (transport === 'http') {
    // Streamable HTTP transport (MCP spec 2025-03-26)
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    app.use(express.json());

    const httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: simpler for single-tenant brand servers
      ...requestPolicy.sdkDnsRebindingOptions,
    });
    await server.connect(httpTransport);

    app.all('/mcp', async (req, res) => {
      await httpTransport.handleRequest(req, res, req.body);
    });

    const httpServer = app.listen(port, host, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      console.error(`[brandkit-mcp] Streamable HTTP server running at http://${urlHost}:${actualPort}/mcp`);
    });
    return httpServer;
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
