import { describe, it, expect } from 'vitest';
import { createReindexRunner } from '../indexer/hot-reload.js';
import type { DesignSystemIndex } from '../indexer/types.js';

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
