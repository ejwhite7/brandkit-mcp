import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import { startStandaloneServer } from '../adapters/standalone.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(__dirname, '../..', '__test_fixtures__', 'v2', 'full');

function writeTempConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-standalone-'));
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: Test Brand\n  root: ${JSON.stringify(fixtureRoot)}\n`,
  );
  return configPath;
}

describe('startStandaloneServer', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server!.close(() => r()));
      server = undefined;
    }
  });

  it('serves /health and returns 400 (not a hang) for /messages without a session', async () => {
    server = await startStandaloneServer(0, writeTempConfig());
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('no address');
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);

    const messages = await fetch(`${base}/messages?sessionId=nope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(messages.status).toBe(400);
    const body = (await messages.json()) as { error: string };
    expect(body.error).toContain('No active SSE session');
  });

  it('supports two concurrent SSE clients without crashing', async () => {
    server = await startStandaloneServer(0, writeTempConfig());
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('no address');
    const base = `http://127.0.0.1:${address.port}`;

    async function openSse(): Promise<{ sessionId: string; abort: () => void }> {
      const controller = new AbortController();
      const res = await fetch(`${base}/sse`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      // The SDK sends: "event: endpoint\ndata: /messages?sessionId=<uuid>\n\n"
      const match = /sessionId=([a-z0-9-]+)/i.exec(text);
      if (!match) throw new Error(`no sessionId in SSE handshake: ${text}`);
      return { sessionId: match[1], abort: () => controller.abort() };
    }

    const c1 = await openSse();
    const c2 = await openSse(); // before the fix this killed the process
    expect(c1.sessionId).not.toBe(c2.sessionId);

    // Both sessions independently routable.
    for (const c of [c1, c2]) {
      const r = await fetch(`${base}/messages?sessionId=${c.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      expect(r.status).toBeLessThan(500);
    }

    c1.abort();
    c2.abort();
  });
});
