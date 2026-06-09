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
  afterEach(() => {
    server?.close();
    server = undefined;
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
});
