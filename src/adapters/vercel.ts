/**
 * @file vercel.ts
 * @description Vercel serverless function adapter for BrandKit MCP.
 * Handles SSE connections and message passing via Vercel's serverless API.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { loadConfig, resolveConfigPaths } from '../config/loader.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { registerAllTools } from '../tools/index.js';
import type { DesignSystemIndex } from '../indexer/types.js';

let cachedIndex: DesignSystemIndex | null = null;
let sseTransport: InstanceType<typeof SSEServerTransport> | null = null;

async function getIndex(): Promise<DesignSystemIndex> {
  if (!cachedIndex) {
    const config = resolveConfigPaths(loadConfig(), process.cwd());
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
  status?: (code: number) => { json: (body: unknown) => void };
}): Promise<void> {
  const index = await getIndex();

  const server = new Server(
    { name: 'brandkit-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  registerAllTools(server, () => index);

  sseTransport = new SSEServerTransport('/api/messages', res as never);
  await server.connect(sseTransport);
}

/**
 * Message handler for Vercel.
 * POST /api/messages -- handles incoming MCP messages.
 */
export async function handleMessages(req: unknown, res: unknown): Promise<void> {
  if (sseTransport) {
    await sseTransport.handlePostMessage(req as never, res as never);
  }
}

