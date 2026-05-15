/**
 * @file resources.test.ts
 * @description Smoke tests for MCP resources and prompts modules (v2).
 */

import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import { listResources, readResource } from '../resources/index.js';
import { listPrompts, getPrompt } from '../prompts/index.js';

describe('resources v2', () => {
  it('lists 14 brand:// URIs', () => {
    const idx = buildFixtureIndex('v2/full');
    expect(listResources(idx)).toHaveLength(14);
  });

  it('reads brand://magic_trick', async () => {
    const idx = buildFixtureIndex('v2/full');
    const res = await readResource('brand://magic_trick', idx);
    expect(res.contents[0].text).toContain('Specificity');
  });

  it('reads brand://verbal/positioning', async () => {
    const idx = buildFixtureIndex('v2/full');
    const res = await readResource('brand://verbal/positioning', idx);
    expect(res.contents[0].text).toContain('solo founders');
  });

  it('reads brand://visual/colors_and_type', async () => {
    const idx = buildFixtureIndex('v2/full');
    const res = await readResource('brand://visual/colors_and_type', idx);
    expect(res.contents[0].text).toContain('--color-primary');
  });

  it('returns unknown for invalid uri', async () => {
    const idx = buildFixtureIndex('v2/full');
    const res = await readResource('brand://nope', idx);
    expect(res.contents[0].text).toContain('Unknown');
  });
});

describe('Prompts v2', () => {
  it('lists prompts with arguments', () => {
    const list = listPrompts();
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.find((p) => p.name === 'design-with-brand')).toBeDefined();
  });

  it('renders the design-with-brand prompt', () => {
    const idx = buildFixtureIndex('v2/full');
    const out = getPrompt('design-with-brand', { feature: 'pricing hero', context: 'web' }, idx);
    expect(out.messages).toHaveLength(1);
    const text = (out.messages[0].content as { text: string }).text;
    expect(text).toContain('pricing hero');
    expect(text).toContain('Test Brand');
  });

  it('throws on unknown prompt', () => {
    const idx = buildFixtureIndex('v2/full');
    expect(() => getPrompt('nope', {}, idx)).toThrow();
  });
});
