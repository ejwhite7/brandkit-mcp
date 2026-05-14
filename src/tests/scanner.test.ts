import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { scanBrandRoot } from '../scanner/directory-scanner.js';

const FIXTURE = resolve(__dirname, '../../__test_fixtures__/v2/full');
const EMPTY = resolve(__dirname, '../../__test_fixtures__/v2/empty');

describe('scanBrandRoot', () => {
  it('finds magic_trick.md', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.magicTrick?.content).toContain('Specificity beats abstraction');
  });

  it('parses all six verbal docs', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.verbal.positioning?.body).toContain('solo founders');
    expect(scan.verbal.messaging?.body).toContain('Ship on-brand');
    expect(scan.verbal.differentiation?.body).toContain('LLMs the brand');
    expect(scan.verbal.concepts?.body).toContain('Atomic system');
    expect(scan.verbal.voice?.body).toContain('Plainspoken');
    const audienceData = scan.verbal.audience?.data as { personas: unknown[] };
    expect(audienceData.personas).toHaveLength(1);
  });

  it('finds base visual content', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.base.colorsAndType?.customProperties['--color-primary']).toBe('#1a1a2e');
    expect(scan.base.components).toHaveLength(1);
    expect(scan.base.tokens).toHaveLength(1);
    expect(scan.base.motion?.tokens).toBeTruthy();
    expect(scan.base.fonts.length).toBeGreaterThanOrEqual(1);
    expect(scan.base.assets.length).toBeGreaterThanOrEqual(1);
  });

  it('finds web overrides', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.web.colorsAndType?.customProperties['--color-bg']).toBe('#fafafa');
  });

  it('finds product overrides', () => {
    const scan = scanBrandRoot(FIXTURE);
    const button = scan.product.components.find((c) => c.name === 'button');
    expect(button).toBeDefined();
  });

  it('returns empty layers + no throw on empty fixture', () => {
    const scan = scanBrandRoot(EMPTY);
    expect(scan.magicTrick).toBeUndefined();
    expect(scan.verbal.positioning).toBeUndefined();
    expect(scan.base.components).toEqual([]);
    expect(scan.base.tokens).toEqual([]);
  });

  it('ignores human/ by default', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.warnings.every((w) => !w.includes('human/'))).toBe(true);
  });
});
