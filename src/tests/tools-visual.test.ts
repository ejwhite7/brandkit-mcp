import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as cat from '../tools/get-colors-and-type.js';
import * as assets from '../tools/get-assets.js';
import * as fonts from '../tools/get-fonts.js';
import * as motion from '../tools/get-motion.js';
import * as components from '../tools/get-components.js';
import * as tokens from '../tools/get-tokens.js';
import * as css from '../tools/get-css.js';
import * as contextDiff from '../tools/get-context-diff.js';
import * as search from '../tools/search-brand.js';
import * as validateUsage from '../tools/validate-usage.js';

describe('get_colors_and_type', () => {
  it('returns base custom properties', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.customProperties['--color-primary']).toBe('#1a1a2e');
  });

  it('honors web override', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'web' });
    const parsed = JSON.parse(result.text);
    expect(parsed.customProperties['--color-bg']).toBe('#fafafa');
  });

  it('omits _taste_primer (visual tool)', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed._taste_primer).toBeUndefined();
  });
});

describe('get_assets', () => {
  it('lists base assets including logo-primary', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = assets.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.assets.find((a: { id?: string }) => a.id === 'logo-primary')).toBeTruthy();
  });

  it('falls through to base when override is empty', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = assets.handler(idx, { context: 'web' });
    const parsed = JSON.parse(result.text);
    expect(parsed.assets.length).toBeGreaterThan(0);
  });
});

describe('get_fonts', () => {
  it('returns the parsed font faces', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = fonts.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.faces[0].family).toBe('Söhne');
  });
});

describe('get_motion', () => {
  it('returns parsed tokens + raw css', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = motion.handler(idx, {});
    const parsed = JSON.parse(result.text);
    expect((parsed.tokens.durations as { fast: string }).fast).toBe('120ms');
    expect(parsed.css).toContain('@keyframes fade-in');
  });

  it('warns when no motion system is present', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = motion.handler(idx, {});
    const parsed = JSON.parse(result.text);
    expect(parsed.tokens).toBeNull();
    expect(parsed._warnings.length).toBeGreaterThan(0);
  });
});

describe('get_components', () => {
  it('returns base button', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = components.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.components.find((c: { name: string }) => c.name === 'button')).toBeTruthy();
  });

  it('applies product override (button comes from artifacts/product/)', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = components.handler(idx, { context: 'product' });
    const parsed = JSON.parse(result.text);
    const btn = parsed.components.find((c: { name: string }) => c.name === 'button');
    expect(btn).toBeDefined();
    // Source path includes "artifacts/product" since the override exists for button.
    expect(btn.source).toContain('artifacts/product');
  });

  it('filters by name', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = components.handler(idx, { context: 'base', name: 'button' });
    const parsed = JSON.parse(result.text);
    expect(parsed.components).toHaveLength(1);
  });
});

describe('get_tokens', () => {
  it('aggregates token specimens (json default)', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = tokens.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.tokens.find((t: { name: string }) => t.name === 'color-primary')?.value).toBe(
      '#1a1a2e',
    );
  });

  it('formats as css', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = tokens.handler(idx, { context: 'base', format: 'css' });
    expect(result.text).toContain('--color-primary: #1a1a2e');
    expect(result.text).toMatch(/^:root \{/);
  });

  it('filters by type', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = tokens.handler(idx, { context: 'base', type: 'color' });
    const parsed = JSON.parse(result.text);
    expect(parsed.tokens.every((t: { type: string }) => t.type === 'color')).toBe(true);
  });
});

describe('get_css', () => {
  it('returns colors_and_type + motion text', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = css.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.colors_and_type).toContain('--color-primary');
    expect(parsed.motion).toContain('@keyframes fade-in');
  });

  it('returns warnings when files missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = css.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed._warnings.length).toBeGreaterThan(0);
  });
});

describe('get_tokens warning injection per format', () => {
  it('returns valid JSON for tailwind format when warnings exist', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'tailwind' });
    const parsed = JSON.parse(result.text); // must not throw
    expect(parsed._warnings).toContain('No token specimens found');
  });

  it('returns valid JSON for w3c format when warnings exist', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'w3c' });
    const parsed = JSON.parse(result.text); // must not throw
    expect(parsed._warnings).toContain('No token specimens found');
  });

  it('keeps comment-style warnings for css format', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'css' });
    expect(result.text.startsWith('/* warnings:')).toBe(true);
  });

  it('keeps comment-style warnings for scss format', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'scss' });
    expect(result.text.startsWith('/* warnings:')).toBe(true);
  });
});

describe('runtime context coercion (tolerance principle)', () => {
  it('get_colors_and_type falls back to base with a warning for unknown context', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'marketing' as never });
    const parsed = JSON.parse(result.text);
    expect(parsed.context).toBe('base');
    expect(parsed._warnings.some((w: string) => w.includes('marketing'))).toBe(true);
  });

  it('all single-context visual tools tolerate an unknown context', () => {
    const idx = buildFixtureIndex('v2/full');
    for (const mod of [css, tokens, motion, assets, fonts, components]) {
      const [result] = mod.handler(idx, { context: 'shared' as never });
      const parsed = JSON.parse(result.text);
      expect(parsed.context).toBe('base');
      expect(parsed._warnings.some((w: string) => w.includes('shared'))).toBe(true);
    }
  });

  it('get_context_diff tolerates unknown contexts and surfaces warnings', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = contextDiff.handler(idx, { a: 'marketing' as never, b: 'product' });
    const parsed = JSON.parse(result.text);
    expect(parsed.a).toBe('base');
    expect(parsed.b).toBe('product');
    expect(parsed._warnings.length).toBeGreaterThan(0);
  });
});

describe('required-arg guards', () => {
  it('search_brand degrades gracefully when query is missing', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = search.handler(idx, {} as never);
    const parsed = JSON.parse(result.text);
    expect(parsed.results).toEqual([]);
    expect(parsed._warnings.some((w: string) => w.includes('query'))).toBe(true);
  });

  it('validate_usage degrades gracefully when snippet is missing', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = validateUsage.handler(idx, {} as never);
    const parsed = JSON.parse(result.text);
    expect(parsed.violations).toEqual([]);
    expect(parsed._warnings.some((w: string) => w.includes('snippet'))).toBe(true);
  });
});
