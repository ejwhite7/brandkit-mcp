import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Server as HttpServer } from 'http';
import { startServer } from '../index.js';
import { previewCommand } from '../cli/commands/preview.js';

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
  '__test_fixtures__',
  'v2',
  'full',
);

const servers: HttpServer[] = [];
const tempDirs: string[] = [];

function writeConfig(networkConfig: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-binding-'));
  tempDirs.push(dir);
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: Binding Test\n  root: ${JSON.stringify(fixtureRoot)}\n${networkConfig}`,
  );
  return configPath;
}

async function listeningAddress(server: HttpServer) {
  if (!server.listening) {
    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('listening', resolveListening);
      server.once('error', rejectListening);
    });
  }
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no address');
  return address;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => {
    server.closeAllConnections();
    server.close(() => resolveClose());
  })));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('network binding', () => {
  it('uses config transport and loopback host for Streamable HTTP by default', async () => {
    const result = await startServer({
      configPath: writeConfig('server:\n  transport: http\n'),
      port: 0,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);

    expect((await listeningAddress(result)).address).toBe('127.0.0.1');
  });

  it('honors server.host for SSE', async () => {
    const result = await startServer({
      configPath: writeConfig('server:\n  transport: sse\n  host: "::1"\n'),
      port: 0,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);

    expect((await listeningAddress(result)).address).toBe('::1');
  });

  it('binds SSE to loopback by default', async () => {
    const result = await startServer({
      configPath: writeConfig('server:\n  transport: sse\n'),
      port: 0,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);

    expect((await listeningAddress(result)).address).toBe('127.0.0.1');
  });

  it('binds preview to loopback by default', async () => {
    const server = await previewCommand({
      config: writeConfig(''),
      port: '0',
    });
    servers.push(server);

    expect((await listeningAddress(server)).address).toBe('127.0.0.1');
  });

  it('honors preview.host', async () => {
    const server = await previewCommand({
      config: writeConfig('preview:\n  host: "::1"\n'),
      port: '0',
    });
    servers.push(server);

    expect((await listeningAddress(server)).address).toBe('::1');
  });
});
