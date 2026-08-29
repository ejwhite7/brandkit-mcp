import { afterEach, describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createBrandWatchPlan,
  createReindexRunner,
  watchBrandDirectory,
} from '../indexer/hot-reload.js';
import type { DesignSystemIndex } from '../indexer/types.js';
import { BrandKitConfigSchema, type BrandKitConfig } from '../types/config.js';

const tempRoots: string[] = [];

function makeRoot(prefix = 'bk-watch-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function makeConfig(root: string, ignore: string[] = ['human/']): BrandKitConfig {
  return BrandKitConfigSchema.parse({
    version: 2,
    brand: { name: 'Watcher test', root },
    ignore,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for watcher update');
    await sleep(25);
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createReindexRunner', () => {
  it('never runs two reindexes concurrently and coalesces overlapping triggers', async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const gates = [deferred(), deferred(), deferred()];
    const updates: DesignSystemIndex[] = [];

    const reindex = async (): Promise<DesignSystemIndex> => {
      const myGate = gates[runs];
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      await myGate.promise;
      active--;
      return { brandName: `run-${runs}` } as never;
    };

    const run = createReindexRunner(reindex, (i) => updates.push(i));

    const p1 = run();
    const p2 = run(); // arrives while run 1 is in flight
    expect(runs).toBe(1); // not started concurrently

    gates[0].resolve();
    await p1;
    await p2;
    await new Promise((r) => setTimeout(r, 0)); // let the queued rerun start

    expect(runs).toBe(2); // coalesced rerun executed after the first completed
    gates[1].resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(maxActive).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('keeps running after a failed reindex', async () => {
    let runs = 0;
    const updates: DesignSystemIndex[] = [];
    const reindex = async (): Promise<DesignSystemIndex> => {
      runs++;
      if (runs === 1) throw new Error('scan exploded');
      return { brandName: 'ok' } as never;
    };
    const run = createReindexRunner(reindex, (i) => updates.push(i));
    await run(); // swallows the error (logged, not thrown)
    await run();
    expect(updates).toHaveLength(1);
  });
});

describe('brand directory watcher', () => {
  it('uses scanner-equivalent exact, boundary, nested, and cross-separator ignores', () => {
    const root = makeRoot();
    const plan = createBrandWatchPlan(makeConfig(root, [
      'magic_trick.md',
      './agent\\visual/components/human/',
      'agent/visual/components/private/./nested',
    ]));
    const ignored = plan.options.ignored as (path: string) => boolean;
    const watchedRoot = plan.root;

    expect(plan.options.followSymlinks).toBe(false);
    expect(ignored(join(watchedRoot, 'magic_trick.md'))).toBe(true);
    expect(ignored(join(watchedRoot, 'magic_trick.md.backup'))).toBe(false);
    expect(ignored(join(watchedRoot, 'agent', 'visual', 'components', 'human', 'secret.md'))).toBe(true);
    expect(ignored(join(watchedRoot, 'agent', 'visual', 'components', 'humanity', 'public.md'))).toBe(false);
    expect(ignored(join(watchedRoot, 'agent', 'visual', 'components', 'private', 'nested', 'secret.md'))).toBe(true);
    expect(ignored(join(watchedRoot, 'agent', 'visual', 'components', 'privateer', 'nested', 'public.md'))).toBe(false);
    expect(ignored(join(watchedRoot, 'agent', 'visual', 'components', 'human', 'secret.md').replace(/\//g, '\\'))).toBe(true);
    expect(ignored(join(watchedRoot, 'node_modules', 'package', 'index.js'))).toBe(true);
    expect(ignored(join(watchedRoot, '.cache', 'state'))).toBe(true);
    expect(ignored(join(watchedRoot, '..', 'outside.md'))).toBe(true);
  });

  it('reloads after valid add, change, and unlink events', async () => {
    const root = makeRoot();
    const indexes: DesignSystemIndex[] = [];
    const stop = watchBrandDirectory(makeConfig(root), (index) => indexes.push(index));
    const magicTrick = join(root, 'magic_trick.md');

    try {
      await stop.ready;
      writeFileSync(magicTrick, 'first\n');
      await waitFor(() => indexes.at(-1)?.magicTrick?.content === 'first');

      writeFileSync(magicTrick, 'second\n');
      await waitFor(() => indexes.at(-1)?.magicTrick?.content === 'second');

      unlinkSync(magicTrick);
      await waitFor(() => indexes.length >= 3 && indexes.at(-1)?.magicTrick === undefined);
    } finally {
      await stop();
    }
  });

  it('does not reload for ignored paths or changes reached through an outside symlink', async () => {
    const root = makeRoot();
    const outside = makeRoot('bk-watch-outside-');
    const ignoredDir = join(root, 'agent', 'visual', 'components', 'human');
    const humanityDir = join(root, 'agent', 'visual', 'components', 'humanity');
    mkdirSync(ignoredDir, { recursive: true });
    mkdirSync(humanityDir, { recursive: true });
    writeFileSync(join(outside, 'outside.md'), 'outside one\n');
    symlinkSync(outside, join(root, 'outside-link'));

    const indexes: DesignSystemIndex[] = [];
    const stop = watchBrandDirectory(
      makeConfig(root, ['magic_trick.md', 'agent/visual/components/human/']),
      (index) => indexes.push(index),
    );

    try {
      await stop.ready;
      writeFileSync(join(root, 'magic_trick.md'), 'ignored fixed path\n');
      writeFileSync(join(ignoredDir, 'ignored.md'), '# ignored discovered path\n');
      writeFileSync(join(outside, 'outside.md'), 'outside two\n');
      symlinkSync(join(outside, 'outside.md'), join(root, 'late-outside-link.md'));
      await sleep(700);
      expect(indexes).toHaveLength(0);

      writeFileSync(join(humanityDir, 'valid.md'), '---\nname: Humanity\n---\n# valid\n');
      await waitFor(() => indexes.length === 1);
      expect(indexes[0].base.components.map((component) => component.name)).toContain('Humanity');
    } finally {
      await stop();
    }
  });
});
