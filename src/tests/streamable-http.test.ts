import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { type Server as HttpServer } from 'http';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { startServer } from '../index.js';
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from '../tools/search-brand.js';

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
  '__test_fixtures__',
  'v2',
  'full',
);

const servers: HttpServer[] = [];
const tempDirs: string[] = [];

function writeConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-streamable-http-'));
  tempDirs.push(dir);
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: HTTP Test\n  root: ${JSON.stringify(fixtureRoot)}\nserver:\n  transport: http\n`,
  );
  return configPath;
}

async function endpointFor(server: HttpServer): Promise<URL> {
  if (!server.listening) {
    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('listening', resolveListening);
      server.once('error', rejectListening);
    });
  }
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no address');
  return new URL(`http://127.0.0.1:${address.port}/mcp`);
}

async function startHttpServer(
  networkLimits: NonNullable<Parameters<typeof startServer>[0]>['networkLimits'] = {},
): Promise<{ server: HttpServer; endpoint: URL }> {
  const server = await startServer({ configPath: writeConfig(), port: 0, networkLimits });
  if (!server) throw new Error('expected an HTTP server');
  servers.push(server);
  return { server, endpoint: await endpointFor(server) };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => {
    server.closeAllConnections();
    server.close(() => resolveClose());
  })));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('stateless Streamable HTTP lifecycle', () => {
  it('supports initialize followed by multiple requests', async () => {
    const { endpoint } = await startHttpServer();
    const client = new Client({ name: 'http-sequential-test', version: '1.0.0' });

    await client.connect(new StreamableHTTPClientTransport(endpoint));
    await expect(client.ping()).resolves.toEqual({});
    const first = await client.listTools();
    const second = await client.listTools();

    expect(first.tools.length).toBeGreaterThan(0);
    expect(second.tools.map((tool) => tool.name)).toEqual(first.tools.map((tool) => tool.name));
    expect(first.tools.map((tool) => tool.name)).not.toContain('sync_brand_docs');
    await client.close();
  });

  it('advertises and enforces bounded search limits at the MCP boundary', async () => {
    const { endpoint } = await startHttpServer();
    const client = new Client({ name: 'http-search-limit-test', version: '1.0.0' });

    await client.connect(new StreamableHTTPClientTransport(endpoint));
    const listed = await client.listTools();
    const searchTool = listed.tools.find(({ name }) => name === 'search_brand');
    expect(searchTool?.inputSchema.properties?.limit).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
      default: DEFAULT_SEARCH_LIMIT,
    });

    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '20', 0, MAX_SEARCH_LIMIT + 1, 1e100]) {
      const result = await client.callTool({
        name: 'search_brand',
        arguments: { query: 'brand', limit },
      });
      expect(result.isError, `limit ${String(limit)}`).toBe(true);
      expect(result.content).toEqual([{
        type: 'text',
        text: `Error executing search_brand: Invalid "limit" argument: expected an integer from 1 to ${MAX_SEARCH_LIMIT}`,
      }]);
    }

    for (const limit of [undefined, 1, MAX_SEARCH_LIMIT]) {
      const result = await client.callTool({
        name: 'search_brand',
        arguments: limit === undefined ? { query: 'brand' } : { query: 'brand', limit },
      }) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(result.isError).not.toBe(true);
      const content = result.content.find((item) => item.type === 'text');
      if (content?.type !== 'text' || typeof content.text !== 'string') {
        throw new Error('missing search response');
      }
      const payload = JSON.parse(content.text) as { results: unknown[] };
      expect(payload.results.length).toBeLessThanOrEqual(limit ?? DEFAULT_SEARCH_LIMIT);
    }

    await client.close();
  });

  it('isolates simultaneous clients', async () => {
    const { endpoint } = await startHttpServer();
    const clients = [1, 2].map((number) => new Client({
      name: `http-concurrent-test-${number}`,
      version: '1.0.0',
    }));

    await Promise.all(clients.map((client) => (
      client.connect(new StreamableHTTPClientTransport(endpoint))
    )));
    const [first, second] = await Promise.all(clients.map((client) => client.listTools()));

    expect(first.tools.length).toBeGreaterThan(0);
    expect(second.tools.map((tool) => tool.name)).toEqual(first.tools.map((tool) => tool.name));
    await Promise.all(clients.map((client) => client.close()));
  });

  it('closes each request Server and transport after the response completes', async () => {
    const serverClose = vi.spyOn(Server.prototype, 'close');
    const transportClose = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
    const { endpoint } = await startHttpServer();
    const client = new Client({ name: 'http-cleanup-test', version: '1.0.0' });

    await client.connect(new StreamableHTTPClientTransport(endpoint));
    const closeCountAfterInitialize = serverClose.mock.calls.length;
    expect(closeCountAfterInitialize).toBeGreaterThan(0);
    expect(transportClose).toHaveBeenCalledTimes(closeCountAfterInitialize);

    await client.listTools();
    expect(serverClose.mock.calls.length).toBeGreaterThan(closeCountAfterInitialize);
    expect(transportClose).toHaveBeenCalledTimes(serverClose.mock.calls.length);
    await client.close();
  });

  it('returns structured method errors for unsupported stateless requests', async () => {
    const { endpoint } = await startHttpServer();

    for (const method of ['GET', 'DELETE']) {
      const response = await fetch(endpoint, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      await expect(response.json()).resolves.toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      });
    }
  });

  it('returns structured responses for malformed bodies and handler failures', async () => {
    const { endpoint } = await startHttpServer();
    const headers = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    };

    const malformed = await fetch(endpoint, { method: 'POST', headers, body: '{' });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    });

    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockRejectedValueOnce(new Error('test-only failure'));
    const failed = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'failure-test', version: '1.0.0' },
        },
      }),
    });
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: 42,
    });
  });

  it('reports readiness without exposing brand data and applies finite server limits', async () => {
    const { server, endpoint } = await startHttpServer();
    const health = await fetch(new URL('/health', endpoint));

    expect(health.status).toBe(200);
    expect(health.headers.get('cache-control')).toBe('no-store');
    await expect(health.json()).resolves.toEqual({ status: 'ready' });
    expect(server.requestTimeout).toBe(30_000);
    expect(server.headersTimeout).toBe(10_000);
    expect(server.keepAliveTimeout).toBe(5_000);
    expect(server.maxHeadersCount).toBe(100);
  });

  it('rejects oversized JSON before creating an MCP request', async () => {
    const { endpoint } = await startHttpServer({ jsonBodyBytes: 128 });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(256) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Request body too large' },
      id: null,
    });
  });

  it('times out a stuck handler and bounds concurrent requests', async () => {
    const { endpoint } = await startHttpServer({
      maxConcurrentRequests: 1,
      requestTimeoutMs: 1_000,
      headersTimeoutMs: 500,
    });
    const transportClose = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
    let signalStarted: (() => void) | undefined;
    const handlerStarted = new Promise<void>((resolveStarted) => {
      signalStarted = resolveStarted;
    });
    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockImplementation(() => {
        signalStarted?.();
        return new Promise<void>(() => {});
      });
    const request = {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }),
    } as const;

    const firstPromise = fetch(endpoint, request);
    await handlerStarted;
    const capacity = await fetch(endpoint, request);
    expect(capacity.status).toBe(503);
    await expect(capacity.json()).resolves.toMatchObject({
      error: { code: -32002, message: 'Server is at request capacity' },
    });

    const timedOut = await firstPromise;
    expect(timedOut.status).toBe(504);
    await expect(timedOut.json()).resolves.toEqual({
      jsonrpc: '2.0',
      error: { code: -32003, message: 'Request timed out' },
      id: 7,
    });
    await vi.waitFor(() => expect(transportClose).toHaveBeenCalled());
  });
});
