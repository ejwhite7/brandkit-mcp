import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { BrandKitConfigSchema } from '../types/config.js';
import { materializeAll, resolveContexts } from '../context-resolver.js';
import { createPreviewServer } from '../preview/server.js';
import { readResource } from '../resources/index.js';
import { buildFixtureIndex } from './helpers.js';
import type { DesignSystemIndex } from '../indexer/types.js';
import * as assetsTool from '../tools/get-assets.js';
import * as colorsTool from '../tools/get-colors-and-type.js';
import * as componentsTool from '../tools/get-components.js';
import * as diffTool from '../tools/get-context-diff.js';
import * as fontsTool from '../tools/get-fonts.js';
import * as motionTool from '../tools/get-motion.js';
import * as searchTool from '../tools/search-brand.js';
import * as tokensTool from '../tools/get-tokens.js';

function refreshContexts(index: DesignSystemIndex) {
  index.contexts = resolveContexts({
    magicTrick: index.magicTrick,
    verbal: index.verbal,
    base: index.base,
    web: index.web,
    product: index.product,
    warnings: index.warnings,
  });
  index.resolved = materializeAll(index.contexts, { brandName: index.brandName });
}

function buildPartialOverrideIndex() {
  const index = buildFixtureIndex('v2/full');
  const button = index.base.components[0];
  const primaryToken = index.base.tokens[0];
  const logo = index.base.assets[0];
  const soehne = index.base.fonts[0];

  button.description = 'Base button sentinel';

  index.base.components.push({
    name: 'card',
    category: 'container',
    description: 'Inherited card sentinel',
    source: '/base/card.md',
  });
  index.base.tokens.push({
    name: 'space-inherited',
    value: '24px',
    type: 'spacing',
    body: 'Inherited token sentinel',
    source: '/base/space.md',
  });
  index.base.assets.push({
    id: 'texture-inherited',
    file: 'texture.png',
    purpose: 'Inherited asset sentinel',
    format: 'png',
    filePath: '/base/texture.png',
  });
  index.base.fonts.push({
    family: 'Inherited Sans',
    weight: 400,
    style: 'normal',
    file: 'inherited.woff2',
    filePath: '/base/inherited.woff2',
    format: 'woff2',
  });

  index.product.components = [{
    ...button,
    description: 'Product button sentinel',
    source: '/product/button.md',
  }];
  index.product.tokens = [{
    ...primaryToken,
    value: '#abcdef',
    body: 'Product token sentinel',
    source: '/product/color-primary.md',
  }];
  index.product.assets = [{
    ...logo,
    purpose: 'Product logo sentinel',
    filePath: '/product/logo.svg',
  }];
  index.product.fonts = [{
    ...soehne,
    file: 'product-soehne.woff2',
    filePath: '/product/product-soehne.woff2',
  }];

  refreshContexts(index);
  return index;
}

function parseTool(result: Array<{ text: string }>) {
  return JSON.parse(result[0].text);
}

describe('canonical merged contexts', () => {
  it('replaces matching entries and preserves unrelated base components, tokens, assets, and fonts', () => {
    const index = buildPartialOverrideIndex();
    const product = index.contexts.product;

    expect(index.product.components).toHaveLength(1);
    expect(product.components.map((item) => item.name)).toEqual(['button', 'card']);
    expect(product.components[0].description).toBe('Product button sentinel');
    expect(product.tokens.map((item) => item.name)).toEqual(['color-primary', 'space-inherited']);
    expect(product.tokens[0].value).toBe('#abcdef');
    expect(product.assets.map((item) => item.id)).toEqual(['logo-primary', 'texture-inherited']);
    expect(product.assets[0].purpose).toBe('Product logo sentinel');
    expect(product.fonts.map((item) => item.family)).toEqual(['Söhne', 'Inherited Sans']);
    expect(product.fonts[0].file).toBe('product-soehne.woff2');
  });

  it('keeps whole-object colors and motion override-or-fallback semantics', () => {
    const index = buildPartialOverrideIndex();
    expect(index.contexts.web.colorsAndType?.customProperties).toEqual({ '--color-bg': '#fafafa' });
    expect(index.contexts.product.colorsAndType).toBe(index.base.colorsAndType);
    expect(index.contexts.product.motion).toBe(index.base.motion);

    index.web.motion = { tokens: { duration: '999ms' }, css: '.web-motion {}', source: '/web/motion' };
    refreshContexts(index);
    expect(index.contexts.web.motion).toBe(index.web.motion);
    expect(index.contexts.web.motion?.tokens).toEqual({ duration: '999ms' });
  });

  it('uses the same case normalization for merging and diff identity', () => {
    const index = buildPartialOverrideIndex();
    index.product.components[0].name = 'BUTTON';
    index.product.tokens[0].name = 'COLOR-PRIMARY';
    index.product.fonts[0].family = 'SÖHNE';
    refreshContexts(index);

    expect(index.contexts.product.components.map((item) => item.name)).toEqual(['BUTTON', 'card']);
    expect(index.contexts.product.tokens.map((item) => item.name)).toEqual(['COLOR-PRIMARY', 'space-inherited']);
    expect(index.contexts.product.fonts.map((item) => item.family)).toEqual(['SÖHNE', 'Inherited Sans']);
    const parsed = parseTool(diffTool.handler(index, { a: 'base', b: 'product' }));
    expect(parsed.components.onlyInA).toEqual([]);
    expect(parsed.components.onlyInB).toEqual([]);
    expect(parsed.tokens.onlyInA).toEqual([]);
    expect(parsed.tokens.onlyInB).toEqual([]);
    expect(parsed.fonts.onlyInA).toEqual([]);
    expect(parsed.fonts.onlyInB).toEqual([]);
  });

  it('gives tools and materialized views the same merged collections', () => {
    const index = buildPartialOverrideIndex();
    expect(parseTool(componentsTool.handler(index, { context: 'product' })).components)
      .toEqual(index.contexts.product.components);
    expect(parseTool(tokensTool.handler(index, { context: 'product' })).tokens)
      .toEqual(index.contexts.product.tokens);
    expect(parseTool(assetsTool.handler(index, { context: 'product' })).assets)
      .toEqual(index.contexts.product.assets);
    expect(parseTool(fontsTool.handler(index, { context: 'product' })).faces)
      .toEqual(index.contexts.product.fonts);
    expect(parseTool(colorsTool.handler(index, { context: 'product' })).customProperties)
      .toEqual(index.contexts.product.colorsAndType?.customProperties);
    expect(parseTool(motionTool.handler(index, { context: 'product' })).tokens)
      .toEqual(index.contexts.product.motion?.tokens);
    expect(index.resolved.product.components.map((item) => item.name)).toEqual(['button', 'card']);
    expect(index.resolved.product.tokens.map((item) => item.name)).toEqual(['color-primary', 'space-inherited']);
    expect(index.resolved.product.textures.map((item) => item.name)).toEqual(['logo-primary', 'texture-inherited']);
    expect(index.resolved.product.fonts.map((item) => item.family)).toEqual(['Söhne', 'Inherited Sans']);
  });

  it('searches inherited entries in each resolved context but not replaced base content', () => {
    const index = buildPartialOverrideIndex();
    const inherited = parseTool(searchTool.handler(index, { query: 'Inherited card sentinel' }));
    expect(inherited.results.map((hit: { context?: string }) => hit.context)).toEqual([
      'base',
      'web',
      'product',
    ]);

    const replaced = parseTool(searchTool.handler(index, { query: 'Product button sentinel' }));
    expect(replaced.results.some((hit: { context?: string }) => hit.context === 'product')).toBe(true);
    const oldButton = parseTool(searchTool.handler(index, { query: 'Base button sentinel' }));
    expect(oldButton.results.some((hit: { context?: string }) => hit.context === 'product')).toBe(false);

    const inheritedQueries = [
      ['Inherited token sentinel', 'token'],
      ['Inherited asset sentinel', 'asset'],
      ['Inherited Sans', 'font'],
    ] as const;
    for (const [query, kind] of inheritedQueries) {
      const parsed = parseTool(searchTool.handler(index, { query }));
      expect(parsed.results.some((hit: { context?: string; kind: string }) =>
        hit.context === 'product' && hit.kind === kind)).toBe(true);
    }
  });

  it('diffs replacement content without reporting inherited items as missing', () => {
    const index = buildPartialOverrideIndex();
    const parsed = parseTool(diffTool.handler(index, { a: 'base', b: 'product' }));
    expect(parsed.components).toEqual({ onlyInA: [], onlyInB: [], changed: ['button'] });
    expect(parsed.tokens).toEqual({ onlyInA: [], onlyInB: [], changed: ['color-primary'] });
    expect(parsed.assets).toEqual({ onlyInA: [], onlyInB: [], changed: ['logo-primary'] });
    expect(parsed.fonts).toEqual({ onlyInA: [], onlyInB: [], changed: ['Söhne:400:normal'] });
    expect(parsed.motion.changed).toBe(false);
  });

  it('keeps base resources equivalent to their tool handlers', async () => {
    const index = buildPartialOverrideIndex();
    const cases = [
      ['brand://visual/components', componentsTool.handler(index, { context: 'base' })],
      ['brand://visual/tokens', tokensTool.handler(index, { context: 'base' })],
      ['brand://visual/assets', assetsTool.handler(index, { context: 'base' })],
      ['brand://visual/fonts', fontsTool.handler(index, { context: 'base' })],
      ['brand://visual/colors_and_type', colorsTool.handler(index, { context: 'base' })],
      ['brand://visual/motion', motionTool.handler(index, { context: 'base' })],
    ] as const;
    for (const [uri, toolResult] of cases) {
      const resource = await readResource(uri, index);
      expect(resource.contents[0].text).toBe(toolResult[0].text);
    }
  });
});

describe('preview canonical context consumption', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  it('renders inherited and replaced entries together for a partial product override', async () => {
    const index = buildPartialOverrideIndex();
    const config = BrandKitConfigSchema.parse({ version: 2, brand: { name: 'Test Brand' } });
    const app = createPreviewServer(index, config);
    const listeningServer = await new Promise<Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    server = listeningServer;
    const address = listeningServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('no address');
    const origin = `http://127.0.0.1:${address.port}`;

    const expectations = [
      ['/components?context=product', ['Product button sentinel', 'Inherited card sentinel']],
      ['/tokens?context=product', ['#abcdef', 'space-inherited']],
      ['/assets?context=product', ['Product logo sentinel', 'texture-inherited']],
      ['/fonts?context=product', ['product-soehne.woff2', 'Inherited Sans']],
      ['/motion?context=product', ['120ms', '@keyframes fade-in']],
      ['/css?context=product', ['--color-primary', '@keyframes fade-in']],
    ] as const;
    for (const [path, sentinels] of expectations) {
      const html = await (await fetch(`${origin}${path}`)).text();
      for (const sentinel of sentinels) expect(html).toContain(sentinel);
    }
  });
});
