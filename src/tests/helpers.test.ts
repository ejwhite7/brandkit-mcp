import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';

describe('buildFixtureIndex', () => {
  it('builds a complete v2/full index', () => {
    const idx = buildFixtureIndex('v2/full');
    expect(idx.magicTrick?.content).toContain('Specificity');
    expect(idx.verbal.positioning?.body).toContain('solo founders');
  });

  it('builds an empty v2/empty index without throwing', () => {
    const idx = buildFixtureIndex('v2/empty');
    expect(idx.magicTrick).toBeUndefined();
    expect(idx.verbal.positioning).toBeUndefined();
  });
});
