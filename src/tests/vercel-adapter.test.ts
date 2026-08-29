import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const servers: HttpServer[] = [];
const originalEnv = { ...process.env };

async function startColdFunction(coldStart: string): Promise<URL> {
  vi.resetModules();
  const module = await import('../adapters/vercel.js');
  expect(module.default).toBeTypeOf('function');
  const server = createServer((request, response) => {
    void module.default(request, response);
  });
  servers.push(server);
  await new Promise<void>((resolveListening, rejectListening) => {
    server.listen(0, '127.0.0.1', resolveListening);
    server.once('error', rejectListening);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('No server address');
  return new URL(`http://127.0.0.1:${address.port}/api/mcp?cold-start=${coldStart}`);
}

async function exerciseColdStart(name: string): Promise<void> {
  const endpoint = await startColdFunction(name);
  const client = new Client({ name: `vercel-${name}`, version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: 'Bearer test-vercel-token' } },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map(({ name: toolName }) => toolName)).toContain('get_brand_overview');
    expect(tools.tools.map(({ name: toolName }) => toolName)).not.toContain('sync_brand_docs');
    const result = await client.callTool({ name: 'get_brand_overview', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.content).not.toHaveLength(0);
  } finally {
    await client.close().catch(() => undefined);
  }
}

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => {
    server.closeAllConnections();
    server.close(() => resolveClose());
  })));
});

describe('Vercel default function', () => {
  it('authenticates and serves initialize plus a tool call across isolated cold starts', async () => {
    process.env.BRANDKIT_AUTH_TOKEN = 'test-vercel-token';
    process.env.BRANDKIT_ALLOWED_HOSTS = '127.0.0.1';
    process.env.BRANDKIT_CONFIG = resolve(root, 'templates/starter/brandkit.config.yaml');

    await exerciseColdStart('one');
    await exerciseColdStart('two');
  });

  it('fails closed for missing authentication and hostile Host headers', async () => {
    process.env.BRANDKIT_AUTH_TOKEN = 'test-vercel-token';
    process.env.BRANDKIT_ALLOWED_HOSTS = '127.0.0.1';
    process.env.BRANDKIT_CONFIG = resolve(root, 'templates/starter/brandkit.config.yaml');
    const endpoint = await startColdFunction('security');
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });

    const unauthenticated = await fetch(endpoint, { method: 'POST', body });
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      error: 'Unauthorized',
      code: 'unauthorized',
    });

    process.env.BRANDKIT_ALLOWED_HOSTS = 'trusted.example';
    const hostileEndpoint = await startColdFunction('hostile-host');
    const hostile = await fetch(hostileEndpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-vercel-token' },
      body,
    });
    expect(hostile.status).toBe(403);
    await expect(hostile.json()).resolves.toEqual({ error: 'Forbidden', code: 'forbidden' });
  });

  it('returns bounded structured method and body errors', async () => {
    process.env.BRANDKIT_AUTH_TOKEN = 'test-vercel-token';
    process.env.BRANDKIT_ALLOWED_HOSTS = '127.0.0.1';
    process.env.BRANDKIT_CONFIG = resolve(root, 'templates/starter/brandkit.config.yaml');
    const endpoint = await startColdFunction('errors');
    const headers = {
      Authorization: 'Bearer test-vercel-token',
      'Content-Type': 'application/json',
    };

    const get = await fetch(endpoint, { headers });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    await expect(get.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
    });

    const malformed = await fetch(endpoint, { method: 'POST', headers, body: '{' });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    });

    const oversized = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ value: 'x'.repeat(256 * 1024) }),
    });
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Request body too large' },
      id: null,
    });
  });

  it('redacts configuration and brand initialization failures', async () => {
    process.env.BRANDKIT_AUTH_TOKEN = 'test-vercel-token';
    process.env.BRANDKIT_ALLOWED_HOSTS = '127.0.0.1';
    process.env.BRANDKIT_CONFIG = resolve(root, 'private-missing-brandkit.config.yaml');
    const endpoint = await startColdFunction('missing-brand');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-vercel-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 72, method: 'ping' }),
    });

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain('private-missing');
    expect(JSON.parse(text)).toEqual({
      jsonrpc: '2.0',
      error: { code: -32004, message: 'Brand data unavailable' },
      id: 72,
    });
  });

  it('ships a current discoverable function and its default read-only data', () => {
    const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
      builds?: unknown;
      functions: Record<string, { includeFiles: string; maxDuration: number }>;
    };
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      files: string[];
    };
    const wrapper = readFileSync(resolve(root, 'api/mcp.js'), 'utf8');

    expect(vercel.builds).toBeUndefined();
    expect(vercel.functions['api/mcp.js']).toEqual({
      includeFiles: 'templates/starter/**',
      maxDuration: 60,
    });
    expect(wrapper).toContain("export { default } from '../dist/adapters/vercel.js'");
    expect(pkg.files).toEqual(expect.arrayContaining(['api', 'dist', 'templates', 'vercel.json']));
  });
});
