/**
 * @file resources.test.ts
 * @description Smoke tests for MCP resources and prompts modules.
 */

import { describe, it, expect } from 'vitest';
import { listResources, readResource } from '../resources/index.js';
import { listPrompts, getPrompt } from '../prompts/index.js';
import type { DesignSystemIndex } from '../indexer/types.js';
import type { ResolvedDesignSystem } from '../types/design-system.js';

function makeIndex(): DesignSystemIndex {
  const emptyResolved: ResolvedDesignSystem = {
    name: 'Test Brand',
    description: 'A test brand',
    context: 'all',
    colors: [
      { name: 'Primary', token: '--color-primary', value: '#1a1a2e', hex: '#1a1a2e', role: 'primary', context: 'shared' },
    ],
    typography: [
      { name: 'Body', token: '--font-family-body', fontFamily: 'Inter, sans-serif', context: 'shared' },
    ],
    logos: { variants: [] },
    components: [],
    textures: [],
    guidelines: [
      { title: 'Brand Voice', section: 'voice', content: 'Be confident.', context: 'shared' },
    ],
    fonts: [],
    cssFiles: [],
    pdfTexts: [],
    assetInventory: { totalFiles: 2, colors: 1, typography: 1, logos: 0, components: 0, textures: 0, guidelines: 1, cssFiles: 0, fonts: 0, pdfs: 0 },
  };
  const empty = { colors: [], typography: [], logos: { variants: [] }, components: [], textures: [], guidelines: [], fonts: [], cssFiles: [], pdfTexts: [] };
  return {
    shared: empty,
    marketing: empty,
    product: empty,
    resolved: { marketing: emptyResolved, product: emptyResolved, all: emptyResolved },
    searchIndex: [],
    lastIndexed: new Date(),
  };
}

describe('Resources', () => {
  const idx = makeIndex();

  it('lists static and dynamic resources', () => {
    const list = listResources(idx);
    const uris = list.map((r) => r.uri);
    expect(uris).toContain('brandkit://overview');
    expect(uris).toContain('brandkit://tokens/css');
    expect(uris).toContain('brandkit://guidelines/brand-voice');
  });

  it('reads the overview resource as JSON', () => {
    const result = readResource('brandkit://overview', idx);
    expect(result.contents[0]).toMatchObject({ mimeType: 'application/json' });
    const c = result.contents[0] as { text: string };
    const json = JSON.parse(c.text);
    expect(json.name).toBe('Test Brand');
  });

  it('reads tokens in CSS format', () => {
    const result = readResource('brandkit://tokens/css', idx);
    const c = result.contents[0] as { text: string; mimeType?: string };
    expect(c.mimeType).toBe('text/css');
    expect(c.text).toContain('--color-primary');
  });

  it('reads guidelines by slug', () => {
    const result = readResource('brandkit://guidelines/brand-voice', idx);
    const c = result.contents[0] as { text: string };
    expect(c.text).toContain('# Brand Voice');
    expect(c.text).toContain('Be confident.');
  });

  it('throws on unknown URI', () => {
    expect(() => readResource('brandkit://nope', idx)).toThrow();
  });
});

describe('Prompts', () => {
  const idx = makeIndex();

  it('lists prompts with arguments', () => {
    const list = listPrompts();
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.find((p) => p.name === 'design-with-brand')).toBeDefined();
  });

  it('renders the design-with-brand prompt with brand context', () => {
    const out = getPrompt('design-with-brand', { feature: 'pricing hero', context: 'marketing' }, idx);
    expect(out.messages).toHaveLength(1);
    const text = (out.messages[0].content as { text: string }).text;
    expect(text).toContain('pricing hero');
    expect(text).toContain('Test Brand');
    expect(text).toContain('--color-primary');
  });

  it('throws on unknown prompt', () => {
    expect(() => getPrompt('nope', {}, idx)).toThrow();
  });
});
