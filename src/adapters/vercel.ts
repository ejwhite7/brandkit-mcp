/**
 * @file vercel.ts
 * @description Vercel serverless function adapter for BrandKit MCP.
 *
 * LIMITATION: SSE requires the GET /api/sse stream and subsequent
 * POST /api/messages calls to land on the same warm instance. With Fluid
 * Compute (instance reuse) this generally holds for a single client; under
 * cold starts or multi-instance fan-out the session will not be found and
 * the POST returns 400 (the client should reconnect). For robust serverless
 * deployment prefer the Streamable HTTP transport in src/index.ts.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { dirname } from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { loadConfigWithPath, resolveConfigPaths } from '../config/loader.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { registerAllTools } from '../tools/index.js';
import { getPackageVersion } from '../version.js';
import type { DesignSystemIndex } from '../indexer/types.js';

let cachedIndex: DesignSystemIndex | null = null;
// One transport per connected client, keyed by sessionId (warm instance only).
const sessions = new Map<string, InstanceType<typeof SSEServerTransport>>();

async function getIndex(): Promise<DesignSystemIndex> {
  if (!cachedIndex) {
    const { config: rawConfig, filePath } = loadConfigWithPath();
    const config = resolveConfigPaths(rawConfig, dirname(filePath));
    cachedIndex = await buildDesignSystemIndex(config);
  }
  return cachedIndex;
}

/**
 * SSE endpoint handler for Vercel.
 * GET /api/sse -- establishes an SSE connection.
 */
export async function handleSSE(req: { method?: string }, res: {
  writeHead: (status: number, headers: Record<string, string>) => void;
  write: (data: string) => void;
  end: () => void;
  on: (event: string, handler: () => void) => void;
  headersSent?: boolean;
}): Promise<void> {
  try {
    const index = await getIndex();

    // The MCP SDK allows one transport per Server instance, so each SSE
    // connection gets its own Server sharing the cached index via closure.
    const server = new Server(
      { name: 'brandkit-mcp', version: getPackageVersion() },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );

    registerAllTools(server, () => index);

    const transport = new SSEServerTransport('/api/messages', res as unknown as ServerResponse);
    sessions.set(transport.sessionId, transport);
    res.on('close', () => sessions.delete(transport.sessionId));
    await server.connect(transport);
  } catch (err) {
    console.error('[brandkit-mcp] SSE handler error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.write(JSON.stringify({ error: 'Internal server error' }));
    res.end();
  }
}

/**
 * Message handler for Vercel.
 * POST /api/messages?sessionId=... -- handles incoming MCP messages.
 */
export async function handleMessages(req: unknown, res: unknown): Promise<void> {
  const rawUrl = (req as { url?: string }).url ?? '';
  const sessionId = new URL(rawUrl, 'http://localhost').searchParams.get('sessionId') ?? '';
  const transport = sessions.get(sessionId);
  if (!transport) {
    const r = res as {
      writeHead: (status: number, headers?: Record<string, string>) => void;
      end: (body: string) => void;
    };
    r.writeHead(400, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify({ error: 'No active SSE session for sessionId (instance may have recycled; reconnect to /api/sse)' }));
    return;
  }
  await transport.handlePostMessage(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    (req as { body?: unknown }).body,
  );
}
