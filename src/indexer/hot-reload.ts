/**
 * @file hot-reload.ts
 * @description File watcher for hot reload in dev mode.
 * Watches the brand directory for file changes and triggers re-indexing.
 * Uses chokidar for cross-platform file watching.
 */

import chokidar from 'chokidar';
import type { BrandKitConfig } from '../types/config.js';
import type { DesignSystemIndex } from './types.js';
import { buildDesignSystemIndex } from './index.js';

/**
 * Starts watching the brand directory for changes.
 * Calls the provided callback with the updated index whenever files change.
 * Debounces rapid changes (e.g., saving multiple files at once).
 * @param config - BrandKit config
 * @param onUpdate - Callback invoked with the new index after re-indexing
 * @returns A function to stop the watcher
 */
export function watchBrandDirectory(
  config: BrandKitConfig,
  onUpdate: (index: DesignSystemIndex) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  const watcher = chokidar.watch(config.paths.brand, {
    persistent: true,
    ignoreInitial: true,
    ignored: [
      /(^|[/\\])\./,  // Ignore dotfiles
      '**/node_modules/**',
    ],
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  const triggerReindex = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        console.error('[hot-reload] File change detected, re-indexing...');
        const startTime = Date.now();
        const newIndex = await buildDesignSystemIndex(config);
        const elapsed = Date.now() - startTime;
        console.error(`[hot-reload] Re-indexed in ${elapsed}ms`);
        onUpdate(newIndex);
      } catch (err) {
        console.error('[hot-reload] Re-indexing failed:', err);
      }
    }, DEBOUNCE_MS);
  };

  watcher.on('add', triggerReindex);
  watcher.on('change', triggerReindex);
  watcher.on('unlink', triggerReindex);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}

