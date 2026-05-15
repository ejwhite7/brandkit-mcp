import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as overview from '../tools/get-brand-overview.js';

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
