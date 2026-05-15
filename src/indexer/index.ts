/**
 * @file index.ts
 * @description Design System Indexer -- orchestrates v2 scanner + resolver to build a
 * complete in-memory index of the design system.
 *
 * Scans the brand_atomic_system directory via scanBrandRoot, resolves contexts
 * via resolveAll, and assembles the results into a DesignSystemIndex.
 */

import { resolve, dirname } from 'path';
import type { BrandKitConfig } from '../types/config.js';
import type { DesignSystemIndex } from './types.js';
import { loadConfigWithPath } from '../config/loader.js';
import { scanBrandRoot } from '../scanner/directory-scanner.js';
import { resolveAll } from '../context-resolver.js';

/**
 * Convenience wrapper: loads a config file by path, scans the brand root, and
 * returns the complete DesignSystemIndex.
 *
 * @param configPath - Absolute or relative path to brandkit.config.yaml
 */
export async function buildIndex(configPath: string): Promise<DesignSystemIndex> {
  const { config, filePath } = loadConfigWithPath(configPath);
  const brandRoot = resolve(dirname(filePath), config.brand.root);
  return buildDesignSystemIndex(config, brandRoot);
}

/**
 * Builds the complete design system index from a loaded BrandKitConfig.
 * This is the main entry point called by the MCP server on startup
 * and when file changes are detected (hot reload).
 *
 * @param config - Loaded and path-resolved BrandKit config
 * @param brandRootOverride - Optional override for the brand root directory.
 *   When omitted, falls back to config.brand.root (which must already be
 *   an absolute path if the caller used resolveConfigPaths).
 * @returns The complete design system index
 */
export async function buildDesignSystemIndex(
  config: BrandKitConfig,
  brandRootOverride?: string,
): Promise<DesignSystemIndex> {
  const brandRoot = brandRootOverride ?? config.brand.root;

  const scan = scanBrandRoot(brandRoot, { ignore: config.ignore });
  const resolved = resolveAll(scan, {
    brandName: config.brand.name,
    brandDescription: config.brand.description,
  });

  return {
    brandName: config.brand.name,
    brandDescription: config.brand.description,
    brandRoot,
    lastIndexed: new Date(),
    magicTrick: scan.magicTrick,
    verbal: scan.verbal,
    base: scan.base,
    web: scan.web,
    product: scan.product,
    resolved,
    warnings: scan.warnings,
  };
}

// ---------------------------------------------------------------------------
// Re-exports retained for downstream callers that import from this module
// ---------------------------------------------------------------------------

export type { DesignSystemIndex } from './types.js';
export type { SearchIndexEntry } from './types.js';

/**
 * Performs full-text search across the search index.
 * @param query - Search query string
 * @param entries - Array of search index entries
 * @param limit - Maximum results to return
 * @param context - Optional context filter
 * @returns Matching entries with relevance scores and snippets
 */
import type { SearchIndexEntry } from './types.js';

export function searchIndex(
  query: string,
  entries: SearchIndexEntry[],
  limit: number = 10,
  context?: string,
): Array<SearchIndexEntry & { score: number; snippet: string }> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  const results: Array<SearchIndexEntry & { score: number; snippet: string }> = [];

  for (const entry of entries) {
    if (context && entry.context !== context) continue;

    const contentLower = entry.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const idx = contentLower.indexOf(term);
      if (idx !== -1) {
        score += 1;
        if (entry.name.toLowerCase().includes(term)) score += 2;
      }
    }

    if (score > 0) {
      const snippetIdx = contentLower.indexOf(queryTerms[0]);
      const snippetStart = Math.max(0, snippetIdx - 40);
      const snippetEnd = Math.min(entry.content.length, snippetIdx + 120);
      const snippet =
        (snippetStart > 0 ? '...' : '') +
        entry.content.slice(snippetStart, snippetEnd).trim() +
        (snippetEnd < entry.content.length ? '...' : '');

      results.push({ ...entry, score, snippet });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
