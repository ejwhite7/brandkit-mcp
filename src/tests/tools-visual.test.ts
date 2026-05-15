import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as cat from '../tools/get-colors-and-type.js';
import * as assets from '../tools/get-assets.js';
import * as fonts from '../tools/get-fonts.js';
import * as motion from '../tools/get-motion.js';

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
