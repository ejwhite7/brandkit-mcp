/**
 * @file preview-server.test.ts
 * @description Integration tests for the v2 preview UI: every page renders
 * against the v2 fixture without missing templates or render errors.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
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
});
