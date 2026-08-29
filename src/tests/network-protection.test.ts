import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { request, type Server as HttpServer } from 'http';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { startStandaloneServer } from '../adapters/standalone.js';
import { startServer } from '../index.js';
import { createNetworkRequestPolicy } from '../network.js';

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
  const dir = mkdtempSync(join(tmpdir(), 'bk-network-protection-'));
  tempDirs.push(dir);
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: Protection Test\n  root: ${JSON.stringify(fixtureRoot)}\nserver:\n  transport: ${transport}\n`,
  );
  return configPath;
}

async function serverBaseUrl(server: HttpServer): Promise<string> {
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

async function requestStatus(
  url: string,
  headers: Record<string, string>,
  method = 'GET',
): Promise<number> {
  return new Promise<number>((resolveStatus, rejectRequest) => {
    const req = request(url, { method, headers }, (res) => {
      res.resume();
      res.on('end', () => resolveStatus(res.statusCode ?? 0));
    });
    req.once('error', rejectRequest);
    req.end();
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => {
    server.closeAllConnections();
    server.close(() => resolveClose());
  })));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('network request policy', () => {
  it('allows loopback Host values across ephemeral ports and IPv4/IPv6', () => {
    const ipv4 = createNetworkRequestPolicy('127.0.0.1', 0);
    expect(ipv4.validate('127.0.0.1:54321', undefined)).toBe(true);
    expect(ipv4.validate('localhost:54321', 'http://localhost:4173')).toBe(true);

    const ipv6 = createNetworkRequestPolicy('::1', 0);
    expect(ipv6.validate('[::1]:54321', 'http://[::1]:4173')).toBe(true);
    expect(ipv6.validate('evil.example:54321', undefined)).toBe(false);

    const fixedPort = createNetworkRequestPolicy('127.0.0.1', 3001);
    expect(fixedPort.sdkDnsRebindingOptions.allowedHosts).toContain('localhost:3001');
    expect(fixedPort.sdkDnsRebindingOptions.allowedHosts).toContain('[::1]:3001');
  });

  it('rejects missing, malformed, duplicate, and hostile headers', () => {
    const policy = createNetworkRequestPolicy('127.0.0.1', 3001);
    expect(policy.validate(undefined, undefined)).toBe(false);
    expect(policy.validate(['localhost', 'evil.example'], undefined)).toBe(false);
    expect(policy.validate('user@localhost:3001', undefined)).toBe(false);
    expect(policy.validate('localhost:3001', ['http://localhost', 'https://evil.example'])).toBe(false);
    expect(policy.validate('localhost:3001', 'https://evil.example')).toBe(false);
    expect(policy.validate('localhost:3001', 'not an origin')).toBe(false);
  });

  it('requires explicit hosts for wildcard bindings and exact origins when configured', () => {
    expect(() => createNetworkRequestPolicy('0.0.0.0', 3001)).toThrow('server.allowedHosts');

    const policy = createNetworkRequestPolicy(
      '0.0.0.0',
      3001,
      ['mcp.example.com'],
      ['https://app.example.com'],
    );
    expect(policy.validate('mcp.example.com:3001', undefined)).toBe(true);
    expect(policy.validate('other.example.com:3001', undefined)).toBe(false);
    expect(policy.validate('mcp.example.com:3001', 'https://app.example.com')).toBe(true);
    expect(policy.validate('mcp.example.com:3001', 'https://mcp.example.com')).toBe(false);
  });

  it('derives only the exact hostname for a concrete non-loopback bind', () => {
    const policy = createNetworkRequestPolicy('192.0.2.10', 3001);
    expect(policy.validate('192.0.2.10:3001', 'http://192.0.2.10:3001')).toBe(true);
    expect(policy.validate('192.0.2.11:3001', undefined)).toBe(false);
  });
});

describe('network transport protection', () => {
  it('returns 403 for hostile Streamable HTTP Host and Origin headers', async () => {
    const result = await startServer({ configPath: writeConfig('http'), port: 0 });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);
    const endpoint = `${await serverBaseUrl(result)}/mcp`;

    expect(await requestStatus(endpoint, { Host: 'evil.example' }, 'POST')).toBe(403);
    expect((await fetch(endpoint, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    })).status).toBe(403);
  });

  it('returns 403 on both SSE routes for hostile headers', async () => {
    const result = await startServer({ configPath: writeConfig('sse'), port: 0 });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);
    const base = await serverBaseUrl(result);

    expect(await requestStatus(`${base}/sse`, { Host: 'attacker.invalid' })).toBe(403);
    expect((await fetch(`${base}/messages?sessionId=missing`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.invalid' },
    })).status).toBe(403);
  });

  it('returns 403 from standalone for hostile Host and Origin headers', async () => {
    const server = await startStandaloneServer(0, writeConfig());
    servers.push(server);
    const health = `${await serverBaseUrl(server)}/health`;

    expect(await requestStatus(health, { Host: 'attacker.invalid' })).toBe(403);
    expect((await fetch(health, {
      headers: { Origin: 'https://attacker.invalid' },
    })).status).toBe(403);
    expect((await fetch(health)).status).toBe(200);
  });
});
