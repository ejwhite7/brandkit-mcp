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
 * Serializes reindex executions: at most one reindex runs at a time. A
 * trigger that arrives mid-flight queues exactly one follow-up run, so the
 * final state always reflects the latest filesystem events (no
 * last-to-complete-wins race). Errors are logged, never thrown.
 * Exported for tests.
 */
export function createReindexRunner(
  reindex: () => Promise<DesignSystemIndex>,
  onUpdate: (index: DesignSystemIndex) => void,
): () => Promise<void> {
  let inFlight = false;
  let rerunRequested = false;

  const run = async (): Promise<void> => {
    if (inFlight) {
      rerunRequested = true;
      return;
    }
    inFlight = true;
    try {
      onUpdate(await reindex());
    } catch (err) {
      console.error('[hot-reload] Re-indexing failed:', err);
    } finally {
      inFlight = false;
      if (rerunRequested) {
        rerunRequested = false;
        void run();
      }
    }
  };

  return run;
}

/**
 * Starts watching the brand directory for changes.
 * Calls the provided callback with the updated index whenever files change.
 * Debounces rapid changes (e.g., saving multiple files at once).
 * @param config - BrandKit config
 * @param onUpdate - Callback invoked with the new index after re-indexing
 * @returns An async function that stops the watcher and resolves when closed
 */
export function watchBrandDirectory(
  config: BrandKitConfig,
  onUpdate: (index: DesignSystemIndex) => void,
): () => Promise<void> {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  const watcher = chokidar.watch(config.brand.root, {
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

  const runReindex = createReindexRunner(async () => {
    console.error('[hot-reload] File change detected, re-indexing...');
    const startTime = Date.now();
    const newIndex = await buildDesignSystemIndex(config);
    console.error(`[hot-reload] Re-indexed in ${Date.now() - startTime}ms`);
    return newIndex;
  }, onUpdate);

  const triggerReindex = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void runReindex();
    }, DEBOUNCE_MS);
  };

  watcher.on('add', triggerReindex);
  watcher.on('change', triggerReindex);
  watcher.on('unlink', triggerReindex);

  return async () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    try {
      await watcher.close();
    } catch (err) {
      console.error('[hot-reload] Failed to close watcher:', err);
    }
  };
}
