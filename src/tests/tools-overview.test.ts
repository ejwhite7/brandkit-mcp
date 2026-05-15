import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as overview from '../tools/get-brand-overview.js';
import * as search from '../tools/search-brand.js';
import * as validate from '../tools/validate-usage.js';
import * as diff from '../tools/get-context-diff.js';

describe('get_brand_overview', () => {
  it('lists 18 tools', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.availableTools).toHaveLength(18);
  });

  it('includes taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed._taste_primer).toContain('Specificity');
  });

  it('reports inventory with v2 categories', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.inventory.tokens).toBe(1);
    expect(parsed.inventory.components).toBe(1);
    expect(parsed.inventory.fonts).toBe(1);
    expect(parsed.inventory.motion).toBe(true);
    expect(parsed.inventory.verbal.positioning).toBe(true);
    expect(parsed.inventory.magicTrick).toBe(true);
  });

  it('reports contexts list', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.contexts).toEqual(['base', 'web', 'product']);
  });

  it('handles empty fixture gracefully', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.inventory.tokens).toBe(0);
    expect(parsed.inventory.magicTrick).toBe(false);
    expect(parsed._taste_primer).toBeNull();
  });
});

describe('search_brand', () => {
  it('finds matches in verbal positioning', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = search.handler(idx, { query: 'solo founders' });
    const parsed = JSON.parse(result.text);
    expect(parsed.results.some((r: { source?: string }) => r.source?.includes('positioning.md'))).toBe(true);
  });

  it('finds matches in tokens', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = search.handler(idx, { query: 'color-primary' });
    const parsed = JSON.parse(result.text);
    expect(parsed.results.some((r: { kind: string }) => r.kind === 'token')).toBe(true);
  });

  it('returns warning when no matches', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = search.handler(idx, { query: 'xyzzy-no-match-string' });
    const parsed = JSON.parse(result.text);
    expect(parsed.results).toEqual([]);
    expect(parsed._warnings.length).toBe(1);
  });
});
