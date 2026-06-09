import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { scanBrandRoot } from '../scanner/directory-scanner.js';
import { resolveAll } from '../context-resolver.js';

const FIXTURE = resolve(__dirname, '../../__test_fixtures__/v2/full');
const EMPTY = resolve(__dirname, '../../__test_fixtures__/v2/empty');

describe('extractTypography classification', () => {
  it('does not misfile tokens containing generic substrings', () => {
    const scan = {
      magicTrick: undefined,
      verbal: {},
      base: {
        colorsAndType: {
          filePath: '/fake/colors_and_type.css',
          rawContent: '',
          customProperties: {
            '--text-underline-offset': '2px',
            '--line-height-tight': '1.2',
            '--letter-spacing-wide': '0.05em',
            '--font-size-display': '4rem',
          },
        },
        components: [],
        tokens: [],
        assets: [],
        fonts: [],
        motion: undefined,
      },
      web: { colorsAndType: undefined, components: [], tokens: [], assets: [], fonts: [], motion: undefined },
      product: { colorsAndType: undefined, components: [], tokens: [], assets: [], fonts: [], motion: undefined },
      warnings: [],
    };
    const resolved = resolveAll(scan as never, { brandName: 'T' });
    const byToken = Object.fromEntries(resolved.base.typography.map((t) => [t.token, t]));

    // --text-underline-offset contains "line" (from "underline") but must NOT be filed as lineHeight
    expect(byToken['--text-underline-offset']?.lineHeight).toBeUndefined();
    // --line-height-tight should correctly be lineHeight
    expect(byToken['--line-height-tight']?.lineHeight).toBe('1.2');
    // --letter-spacing-wide should not be misclassified
    expect(byToken['--letter-spacing-wide']?.letterSpacing).toBe('0.05em');
    // --font-size-display should correctly be fontSize
    expect(byToken['--font-size-display']?.fontSize).toBe('4rem');
  });
});

describe('resolveAll', () => {
  it('produces base/web/product views', () => {
    const scan = scanBrandRoot(FIXTURE);
    const resolved = resolveAll(scan, { brandName: 'Acme' });
    expect(resolved.base).toBeDefined();
    expect(resolved.web).toBeDefined();
    expect(resolved.product).toBeDefined();
  });

  it('honours web override for colors_and_type', () => {
    const scan = scanBrandRoot(FIXTURE);
    const resolved = resolveAll(scan, { brandName: 'Acme' });
    // base: --color-bg = #ffffff; web override: --color-bg = #fafafa
    const baseBg = resolved.base.colors.find((c) => c.token === '--color-bg');
    const webBg = resolved.web.colors.find((c) => c.token === '--color-bg');
    expect(baseBg?.value).toBe('#ffffff');
    expect(webBg?.value).toBe('#fafafa');
  });

  it('falls through to base when override is missing', () => {
    // The product artifact only overrides components/button.md; colors_and_type is NOT overridden in product.
    const scan = scanBrandRoot(FIXTURE);
    const resolved = resolveAll(scan, { brandName: 'Acme' });
    const productBg = resolved.product.colors.find((c) => c.token === '--color-bg');
    expect(productBg?.value).toBe('#ffffff');
  });

  it('applies product component override', () => {
    const scan = scanBrandRoot(FIXTURE);
    const resolved = resolveAll(scan, { brandName: 'Acme' });
    const productButton = resolved.product.components.find((c) => c.name === 'button');
    const baseButton = resolved.base.components.find((c) => c.name === 'button');
    expect(productButton).toBeDefined();
    expect(baseButton).toBeDefined();
    // The override changed the prose to mention "Square corners". The DesignComponent
    // shape captures markdown body content in `usage` or a related field.
    // Verify by source path (override file vs base file).
    expect(productButton?.source).toContain('artifacts/product');
    expect(baseButton?.source).not.toContain('artifacts');
  });

  it('handles empty fixture without throwing', () => {
    const scan = scanBrandRoot(EMPTY);
    const resolved = resolveAll(scan, { brandName: 'Test' });
    expect(resolved.base.colors).toEqual([]);
    expect(resolved.base.components).toEqual([]);
    expect(resolved.base.tokens).toEqual([]);
  });

  it('carries brandName + description into each resolved view', () => {
    const scan = scanBrandRoot(FIXTURE);
    const resolved = resolveAll(scan, {
      brandName: 'Acme',
      brandDescription: 'Plumbing for builders',
    });
    expect(resolved.base.name).toBe('Acme');
    expect(resolved.web.name).toBe('Acme');
    expect(resolved.product.name).toBe('Acme');
    expect(resolved.base.description).toBe('Plumbing for builders');
  });
});
