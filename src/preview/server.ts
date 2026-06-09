/**
 * @file preview/server.ts
 * @description Local preview server for browsing the design system visually.
 * Provides a web-based UI showing colors, typography, components, logos,
 * guidelines, and other design system assets.
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import ejs from 'ejs';
import { readFileSync } from 'fs';
import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandKitConfig } from '../types/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Mutable reference wrapper so hot-reload can update the live index. */
export interface IndexRef {
  current: DesignSystemIndex;
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
    const index = ref.current;
    const inventory = {
      tokens: index.base.tokens.length,
      components: index.base.components.length,
      fonts: index.base.fonts.length,
      assets: index.base.assets.length,
      motion: index.base.motion != null,
    };
    res.send(renderPage('index', { title: `${config.brand.name} Design System`, inventory }));
  });

  app.get('/colors', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('colors', {
      title: 'Colors and Typography',
      base: index.base.colorsAndType,
      web: index.web.colorsAndType,
      product: index.product.colorsAndType,
    }));
  });

  app.get('/typography', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('typography', {
      title: 'Typography',
      base: index.base.colorsAndType,
    }));
  });

  app.get('/assets', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('assets', {
      title: 'Assets',
      assets: index.base.assets,
    }));
  });

  app.get('/components', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('components', {
      title: 'Components',
      base: index.base.components,
      web: index.web.components,
      product: index.product.components,
    }));
  });

  app.get('/tokens', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('tokens', {
      title: 'Design Tokens',
      tokens: index.base.tokens,
    }));
  });

  app.get('/motion', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('motion', {
      title: 'Motion',
      motion: index.base.motion,
    }));
  });

  app.get('/fonts', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('fonts', {
      title: 'Fonts',
      fonts: index.base.fonts,
    }));
  });

  app.get('/verbal', (_req, res) => {
    const index = ref.current;
    res.send(renderPage('verbal', {
      title: 'Verbal Layer',
      verbal: index.verbal,
      magicTrick: index.magicTrick,
    }));
  });

  app.get('/search', (req, res) => {
    const query = (req.query.q as string) ?? '';
    const results: unknown[] = [];
    res.send(renderPage('search', { title: 'Search', query, results }));
  });

  return app;
}
