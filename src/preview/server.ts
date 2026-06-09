/**
 * @file preview/server.ts
 * @description Local preview server for browsing the brand atomic system
 * visually. Renders the v2 index: colors, typography, token specimens,
 * components, assets, fonts, motion, the verbal layer, raw CSS, and search.
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import ejs from 'ejs';
import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandKitConfig } from '../types/config.js';
import type { BrandContext } from '../types/design-system.js';
import { handler as searchBrandHandler } from '../tools/search-brand.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Mutable reference wrapper so hot-reload can update the live index. */
export interface IndexRef {
  current: DesignSystemIndex;
}

const CONTEXTS = ['base', 'web', 'product'] as const;

/** Coerce a ?context= query value to a valid BrandContext (default base). */
function pickContext(value: unknown): BrandContext {
  return typeof value === 'string' && (CONTEXTS as readonly string[]).includes(value)
    ? (value as BrandContext)
    : 'base';
}

/**
 * Resolve the preview asset directories. Works in both development
 * (src/preview/) and production (dist/preview/ or dist/cli/).
 */
function resolvePreviewDirs(): { templatesDir: string; staticDir: string } {
  // Candidate locations in priority order
  const candidates = [
    // When running from src/preview/ directly (dev / ts-node)
    join(__dirname, 'templates'),
    // When bundled into dist/cli/ and assets copied to dist/preview/
    join(__dirname, '..', 'preview', 'templates'),
    // When bundled into dist/ root and assets copied to dist/preview/
    join(__dirname, 'preview', 'templates'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const base = dirname(candidate);
      return {
        templatesDir: candidate,
        staticDir: join(base, 'static'),
      };
    }
  }

  // Fallback -- use __dirname-relative (original behavior)
  return {
    templatesDir: join(__dirname, 'templates'),
    staticDir: join(__dirname, 'static'),
  };
}

/**
 * Creates the Express preview server application.
 * Accepts either a plain DesignSystemIndex or an IndexRef so that hot-reload
 * can swap the underlying index without restarting the server.
 * @param indexOrRef - The design system index or a mutable ref to one
 * @param config - BrandKit configuration
 * @returns Express application
 */
export function createPreviewServer(
  indexOrRef: DesignSystemIndex | IndexRef,
  config: BrandKitConfig,
): express.Application {
  const app = express();

  // Normalise to a ref object so route handlers always read the latest index
  const ref: IndexRef = 'current' in indexOrRef
    ? indexOrRef as IndexRef
    : { current: indexOrRef };

  const { templatesDir, staticDir } = resolvePreviewDirs();

  // Serve static files
  app.use('/static', express.static(staticDir));

  // Template rendering helper
  function renderPage(template: string, data: Record<string, unknown>): string {
    const index = ref.current;
    const templatePath = join(templatesDir, `${template}.ejs`);
    const layoutPath = join(templatesDir, 'layout.ejs');

    let templateContent: string;
    try {
      templateContent = readFileSync(templatePath, 'utf-8');
    } catch {
      templateContent = '<h1>Template not found</h1>';
    }

    let body: string;
    try {
      body = ejs.render(templateContent, { ...data, config, index });
    } catch (err) {
      // Tolerance principle: a broken template renders an error page, not a 500.
      body = `<h1>Template error</h1><pre>${String(err)}</pre>`;
    }

    let layoutContent: string;
    try {
      layoutContent = readFileSync(layoutPath, 'utf-8');
    } catch {
      return body;
    }

    try {
      return ejs.render(layoutContent, { body, title: data.title ?? config.brand.name, config });
    } catch {
      return body;
    }
  }

  // Routes
  app.get('/', (_req, res) => {
    res.send(renderPage('index', { title: `${config.brand.name} Brand System` }));
  });

  app.get('/colors', (req, res) => {
    const ctx = pickContext(req.query.context);
    res.send(renderPage('colors', {
      title: 'Colors',
      ctx,
      colors: ref.current.resolved[ctx].colors,
    }));
  });

  app.get('/typography', (req, res) => {
    const ctx = pickContext(req.query.context);
    res.send(renderPage('typography', {
      title: 'Typography',
      ctx,
      typography: ref.current.resolved[ctx].typography,
    }));
  });

  app.get('/tokens', (req, res) => {
    const ctx = pickContext(req.query.context);
    res.send(renderPage('tokens', {
      title: 'Design Tokens',
      ctx,
      tokens: ref.current.resolved[ctx].tokens,
    }));
  });

  app.get('/components', (req, res) => {
    const ctx = pickContext(req.query.context);
    res.send(renderPage('components', {
      title: 'Components',
      ctx,
      components: ref.current.resolved[ctx].components,
    }));
  });

  app.get('/assets', (req, res) => {
    const ctx = pickContext(req.query.context);
    const index = ref.current;
    // Override layer falls through to base when empty (same rule as get_assets).
    const assets = index[ctx].assets.length ? index[ctx].assets : index.base.assets;
    res.send(renderPage('assets', { title: 'Assets', ctx, assets }));
  });

  app.get('/fonts', (req, res) => {
    const ctx = pickContext(req.query.context);
    const index = ref.current;
    const fonts = index[ctx].fonts.length ? index[ctx].fonts : index.base.fonts;
    res.send(renderPage('fonts', { title: 'Fonts', ctx, fonts }));
  });

  app.get('/motion', (req, res) => {
    const ctx = pickContext(req.query.context);
    const index = ref.current;
    res.send(renderPage('motion', {
      title: 'Motion',
      ctx,
      motion: index[ctx].motion ?? index.base.motion,
    }));
  });

  app.get('/verbal', (_req, res) => {
    res.send(renderPage('verbal', { title: 'Verbal Identity' }));
  });

  app.get('/css', (req, res) => {
    const ctx = pickContext(req.query.context);
    const index = ref.current;
    res.send(renderPage('css', {
      title: 'CSS',
      ctx,
      colorsAndTypeCss:
        index[ctx].colorsAndType?.rawContent ?? index.base.colorsAndType?.rawContent ?? '',
      motionCss: index[ctx].motion?.css ?? index.base.motion?.css ?? '',
    }));
  });

  app.get('/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    interface SearchHit { kind: string; snippet: string; source?: string; context?: string }
    let results: SearchHit[] = [];
    if (query) {
      try {
        // Reuse the search_brand tool's tested search logic.
        const [content] = searchBrandHandler(ref.current, { query });
        results = (JSON.parse(content.text) as { results: SearchHit[] }).results;
      } catch {
        // Tolerance principle: render an empty result list, not a 500.
      }
    }
    res.send(renderPage('search', { title: 'Search', query, results }));
  });

  return app;
}
