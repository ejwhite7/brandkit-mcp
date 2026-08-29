import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import type { Server as HttpServer } from 'http';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { DesignSystemIndex } from '../indexer/types.js';
import { buildFixtureIndex } from './helpers.js';

const watcherCallbacks = vi.hoisted(
  () => [] as Array<(index: DesignSystemIndex) => void>,
);

vi.mock('../indexer/hot-reload.js', () => ({
  watchBrandDirectory: vi.fn((
    _config: unknown,
    onUpdate: (index: DesignSystemIndex) => void,
  ) => {
    watcherCallbacks.push(onUpdate);
    return async () => {};
  }),
}));

import { startServer } from '../index.js';

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
  '__test_fixtures__',
  'v2',
  'full',
);

const servers: HttpServer[] = [];
const clients: Client[] = [];
const tempDirs: string[] = [];
const initialSignalListeners = {
  SIGINT: new Set(process.listeners('SIGINT')),
  SIGTERM: new Set(process.listeners('SIGTERM')),
};

function writeConfig(brandName: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-server-state-'));
  tempDirs.push(dir);
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: ${JSON.stringify(brandName)}\n  root: ${JSON.stringify(fixtureRoot)}\nserver:\n  transport: http\n`,
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

async function startHttpServer(brandName: string, watch = false): Promise<URL> {
  const server = await startServer({
    configPath: writeConfig(brandName),
    transport: 'http',
    port: 0,
    watch,
  });
  if (!server) throw new Error('expected an HTTP server');
  servers.push(server);
  return endpointFor(server);
}

async function readBrandName(endpoint: URL): Promise<string> {
  const client = new Client({ name: 'state-isolation-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const result = await client.callTool({
    name: 'get_brand_overview',
    arguments: {},
  }) as { content: Array<{ type: string; text?: string }> };
  const content = result.content.find((item) => item.type === 'text');
  if (!content?.text) throw new Error('missing overview text');
  return (JSON.parse(content.text) as { name: string }).name;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => {
    server.closeAllConnections();
    server.close(() => resolveClose());
  })));
  watcherCallbacks.length = 0;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    for (const listener of process.listeners(signal)) {
      if (!initialSignalListeners[signal].has(listener)) process.removeListener(signal, listener);
    }
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('startServer index isolation', () => {
  it('keeps two live servers bound to their own brand indexes', async () => {
    const alpha = await startHttpServer('Alpha Brand');
    const beta = await startHttpServer('Beta Brand');

    await expect(Promise.all([readBrandName(alpha), readBrandName(beta)]))
      .resolves.toEqual(['Alpha Brand', 'Beta Brand']);
  });

  it('applies watcher updates only to the server that owns the watcher', async () => {
    const alpha = await startHttpServer('Alpha Brand', true);
    const beta = await startHttpServer('Beta Brand', true);
    expect(watcherCallbacks).toHaveLength(2);

    watcherCallbacks[0]({
      ...buildFixtureIndex('v2/full'),
      brandName: 'Alpha Reloaded',
    });

    await expect(Promise.all([readBrandName(alpha), readBrandName(beta)]))
      .resolves.toEqual(['Alpha Reloaded', 'Beta Brand']);
  });
});
