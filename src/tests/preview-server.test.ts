/**
 * @file preview-server.test.ts
 * @description Integration tests for the v2 preview UI: every page renders
 * against the v2 fixture without missing templates or render errors.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request as httpRequest, type Server } from 'http';
import { buildFixtureIndex } from './helpers.js';
import { createPreviewServer } from '../preview/server.js';
import { BrandKitConfigSchema } from '../types/config.js';

const PAGES = [
  '/',
  '/colors',
  '/typography',
  '/tokens',
  '/components',
  '/assets',
  '/fonts',
  '/motion',
  '/verbal',
  '/css',
  '/search?q=primary',
];

function getWithHost(url: string, host: string): Promise<{ status: number; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers: { Host: host },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

describe('preview server (v2)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const config = BrandKitConfigSchema.parse({ version: 2, brand: { name: 'Test Brand' } });
    const app = createPreviewServer(buildFixtureIndex('v2/full'), config);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('no address');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each(PAGES)('renders %s without template errors', async (page) => {
    const res = await fetch(`${base}${page}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Test Brand');
    expect(html).not.toContain('Template not found');
    expect(html).not.toContain('Template error');
  });

  it('shows base colors from the fixture', async () => {
    const html = await (await fetch(`${base}/colors`)).text();
    expect(html).toContain('--color-primary');
  });

  it('honors the web context override on /colors', async () => {
    const html = await (await fetch(`${base}/colors?context=web`)).text();
    expect(html).toContain('--color-bg');
  });

  it('falls back to base for an unknown context', async () => {
    const res = await fetch(`${base}/colors?context=marketing`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('--color-primary');
  });

  it('renders the verbal layer with the magic trick', async () => {
    const html = await (await fetch(`${base}/verbal`)).text();
    expect(html).toContain('Positioning');
    expect(html).toContain('Magic Trick');
  });

  it('returns search results for fixture content', async () => {
    const html = await (await fetch(`${base}/search?q=color`)).text();
    expect(html).toContain('result');
  });

  it('serves static assets to a normal loopback browser origin', async () => {
    const res = await fetch(`${base}/static/styles.css`, {
      headers: { Origin: base },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('BrandKit MCP Preview Server Styles');
  });

  it.each(['/', '/assets', '/static/styles.css'])(
    'rejects a hostile Host header on %s',
    async (page) => {
      const response = await getWithHost(`${base}${page}`, 'attacker.example');
      expect(response.status).toBe(403);
      expect(response.body).not.toContain('Test Brand');
    },
  );

  it('rejects a hostile browser Origin before rendering brand data', async () => {
    const res = await fetch(`${base}/colors`, {
      headers: { Origin: 'https://attacker.example' },
    });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('--color-primary');
  });

  it('refuses to create a preview configured for a non-loopback host', () => {
    const config = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Test Brand' },
      preview: { host: '0.0.0.0' },
    });

    expect(() => createPreviewServer(buildFixtureIndex('v2/full'), config)).toThrow(
      /loopback/i,
    );
  });
});
