/**
 * @file preview/server.ts
 * @description Local preview server for browsing the design system visually.
 * Provides a web-based UI showing colors, typography, components, logos,
 * guidelines, and other design system assets.
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { readFileSync } from 'fs';
import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandKitConfig } from '../types/config.js';
import { searchIndex as searchIndexFn } from '../indexer/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates the Express preview server application.
 * @param index - The design system index
 * @param config - BrandKit configuration
 * @returns Express application
 */
export function createPreviewServer(
  index: DesignSystemIndex,
  config: BrandKitConfig,
): express.Application {
  const app = express();
  const templatesDir = join(__dirname, 'templates');
  const staticDir = join(__dirname, 'static');

  // Serve static files
  app.use('/static', express.static(staticDir));

  // Template rendering helper
  function renderPage(template: string, data: Record<string, unknown>): string {
    const templatePath = join(templatesDir, `${template}.ejs`);
    const layoutPath = join(templatesDir, 'layout.ejs');

    let templateContent: string;
    try {
      templateContent = readFileSync(templatePath, 'utf-8');
    } catch {
      templateContent = '<h1>Template not found</h1>';
    }

    const body = ejs.render(templateContent, { ...data, config, index });

    let layoutContent: string;
    try {
      layoutContent = readFileSync(layoutPath, 'utf-8');
    } catch {
      return body;
    }

    return ejs.render(layoutContent, { body, title: data.title ?? config.name, config });
  }

  // Routes
  app.get('/', (_req, res) => {
    const inv = index.resolved.all.assetInventory;
    res.send(renderPage('index', { title: `${config.name} Design System`, inventory: inv }));
  });

  app.get('/colors', (_req, res) => {
    res.send(renderPage('colors', {
      title: 'Colors',
      shared: index.shared.colors,
      marketing: index.marketing.colors,
      product: index.product.colors,
      all: index.resolved.all.colors,
    }));
  });

  app.get('/typography', (_req, res) => {
    res.send(renderPage('typography', {
      title: 'Typography',
      shared: index.shared.typography,
      marketing: index.marketing.typography,
      product: index.product.typography,
      all: index.resolved.all.typography,
    }));
  });

  app.get('/logos', (_req, res) => {
    res.send(renderPage('logos', {
      title: 'Logos',
      logos: index.resolved.all.logos,
    }));
  });

  app.get('/components', (_req, res) => {
    res.send(renderPage('components', {
      title: 'Components',
      marketing: index.marketing.components,
      product: index.product.components,
      all: index.resolved.all.components,
    }));
  });

  app.get('/guidelines', (_req, res) => {
    res.send(renderPage('guidelines', {
      title: 'Guidelines',
      guidelines: index.resolved.all.guidelines,
    }));
  });

  app.get('/tokens', (_req, res) => {
    res.send(renderPage('tokens', {
      title: 'Design Tokens',
      colors: index.resolved.all.colors,
      typography: index.resolved.all.typography,
    }));
  });

  app.get('/textures', (_req, res) => {
    res.send(renderPage('textures', {
      title: 'Textures',
      textures: index.resolved.all.textures,
    }));
  });

  app.get('/css', (_req, res) => {
    res.send(renderPage('css', {
      title: 'CSS Files',
      cssFiles: index.resolved.all.cssFiles,
    }));
  });

  app.get('/search', (req, res) => {
    const query = (req.query.q as string) ?? '';
    let results: unknown[] = [];
    if (query) {
      results = searchIndexFn(query, index.searchIndex, 20);
    }
    res.send(renderPage('search', { title: 'Search', query, results }));
  });

  return app;
}

