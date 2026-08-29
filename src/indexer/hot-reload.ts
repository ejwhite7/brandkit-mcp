/**
 * @file hot-reload.ts
 * @description File watcher for hot reload in dev mode.
 * Watches the brand directory for file changes and triggers re-indexing.
 * Uses chokidar for cross-platform file watching.
 */

import chokidar from 'chokidar';
import { lstatSync, realpathSync } from 'fs';
import { isAbsolute, relative } from 'path';
import type { BrandKitConfig } from '../types/config.js';
import type { DesignSystemIndex } from './types.js';
import { buildDesignSystemIndex } from './index.js';
import { createBrandPathIgnoreMatcher } from '../scanner/directory-scanner.js';

export interface BrandWatchPlan {
  root: string;
  options: chokidar.WatchOptions;
}

export interface BrandWatcherStop {
  (): Promise<void>;
  /** Resolves after Chokidar has completed its initial crawl. */
  readonly ready: Promise<void>;
}

/** Build deterministic watcher options from the scanner's ignore policy. */
export function createBrandWatchPlan(config: BrandKitConfig): BrandWatchPlan {
  // The configured root itself may intentionally be a symlink. Resolve that
  // one trusted entry before disabling all descendant symlink traversal.
  const root = realpathSync.native(config.brand.root);
  const configuredIgnore = createBrandPathIgnoreMatcher(root, config.ignore);

  return {
    root,
    options: {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      ignored: (path: string) => {
        const normalizedPath = path.replace(/\\/g, '/');
        const normalizedRoot = root.replace(/\\/g, '/');
        const brandPath = relative(normalizedRoot, normalizedPath).replace(/\\/g, '/');
        if (brandPath === '..' || brandPath.startsWith('../') || isAbsolute(brandPath)) return true;
        if (brandPath === '') return false;

        const segments = brandPath.split('/');
        return (
          segments.some((segment) => segment.startsWith('.') || segment === 'node_modules') ||
          configuredIgnore.matches(path)
        );
      },
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    },
  };
}

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
): BrandWatcherStop {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  const plan = createBrandWatchPlan(config);
  const watcher = chokidar.watch(plan.root, plan.options);
  const ready = new Promise<void>((resolveReady) => watcher.once('ready', resolveReady));

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
  watcher.on('change', (path) => {
    // With followSymlinks disabled, Chokidar can still emit a change for the
    // symlink entry when its outside target changes. The scanner will reject
    // that target, so such an event must not cause a reload either.
    try {
      if (lstatSync(path).isSymbolicLink()) return;
    } catch {
      // A concurrent unlink is handled by the unlink event below.
    }
    triggerReindex();
  });
  watcher.on('unlink', triggerReindex);

  const stop = async () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    try {
      await watcher.close();
    } catch (err) {
      console.error('[hot-reload] Failed to close watcher:', err);
    }
  };
  return Object.assign(stop, { ready });
}
