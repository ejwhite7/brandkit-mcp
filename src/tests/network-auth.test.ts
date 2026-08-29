import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import type { Server as HttpServer } from 'http';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { startStandaloneServer } from '../adapters/standalone.js';
import { startServer } from '../index.js';
import { createNetworkAuthPolicy, isLoopbackHost } from '../network.js';

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
  '__test_fixtures__',
  'v2',
  'full',
);

const servers: HttpServer[] = [];
const tempDirs: string[] = [];

function writeConfig(transport: 'sse' | 'http' = 'sse'): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-auth-'));
  tempDirs.push(dir);
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: Auth Test\n  root: ${JSON.stringify(fixtureRoot)}\nserver:\n  transport: ${transport}\n  host: "0.0.0.0"\n  allowedHosts:\n    - "127.0.0.1"\n`,
  );
  return configPath;
}

async function baseUrl(server: HttpServer): Promise<string> {
  if (!server.listening) {
    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('listening', resolveListening);
      server.once('error', rejectListening);
    });
  }
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no address');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => {
    server.closeAllConnections();
    server.close(() => resolveClose());
  })));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('network authentication policy', () => {
  it('recognizes loopback hosts without exempting wildcard hosts', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.25.0.9')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('::')).toBe(false);
    expect(isLoopbackHost('example.com')).toBe(false);
  });

  it('requires an exact Bearer token only for non-loopback hosts', () => {
    const policy = createNetworkAuthPolicy('0.0.0.0', 'correct-token');
    expect(policy.required).toBe(true);
    expect(policy.authorize(undefined)).toBe(false);
    expect(policy.authorize('Basic correct-token')).toBe(false);
    expect(policy.authorize('Bearer wrong-token')).toBe(false);
    expect(policy.authorize('bearer correct-token')).toBe(true);
    expect(createNetworkAuthPolicy('127.0.0.1').authorize(undefined)).toBe(true);
  });

  it('refuses to start non-loopback mode without a usable token', () => {
    expect(() => createNetworkAuthPolicy('0.0.0.0', '')).toThrow('BRANDKIT_AUTH_TOKEN');
    expect(() => createNetworkAuthPolicy('0.0.0.0', 'has whitespace')).toThrow('BRANDKIT_AUTH_TOKEN');
  });

  it('uses BRANDKIT_AUTH_TOKEN when no token is injected', () => {
    vi.stubEnv('BRANDKIT_AUTH_TOKEN', 'environment-token');
    const policy = createNetworkAuthPolicy('0.0.0.0');
    expect(policy.authorize('Bearer environment-token')).toBe(true);
    expect(policy.authorize('Bearer different-token')).toBe(false);
  });
});

describe('startServer authentication', () => {
  it('returns 401 for missing and invalid Streamable HTTP credentials', async () => {
    const token = 'streamable-secret';
    const result = await startServer({
      configPath: writeConfig('http'),
      port: 0,
      authToken: token,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);
    const endpoint = `${await baseUrl(result)}/mcp`;

    for (const authorization of [undefined, 'Bearer incorrect']) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authorization === undefined ? {} : { Authorization: authorization },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
    }

    const authorized = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(authorized.status).not.toBe(401);
  });

  it('protects both SSE endpoints and never logs the credential', async () => {
    const token = 'sse-do-not-log-this';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await startServer({
      configPath: writeConfig('sse'),
      port: 0,
      authToken: token,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);
    const base = await baseUrl(result);

    expect((await fetch(`${base}/sse`)).status).toBe(401);
    expect((await fetch(`${base}/messages?sessionId=missing`, {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid' },
    })).status).toBe(401);

    const controller = new AbortController();
    const authorized = await fetch(`${base}/sse`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    expect(authorized.status).toBe(200);
    controller.abort();

    const logs = errorSpy.mock.calls.flat().map(String).join('\n');
    expect(logs).not.toContain(token);
  });
});

describe('standalone authentication', () => {
  it('returns 401 without the configured token and allows it with the token', async () => {
    const token = 'standalone-secret';
    const server = await startStandaloneServer(0, writeConfig(), undefined, token);
    servers.push(server);
    const healthUrl = `${await baseUrl(server)}/health`;

    expect((await fetch(healthUrl)).status).toBe(401);
    expect((await fetch(healthUrl, {
      headers: { Authorization: 'Bearer incorrect' },
    })).status).toBe(401);
    expect((await fetch(healthUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })).status).toBe(200);
  });
});
