/**
 * @file parsers.test.ts
 * @description Unit tests for the BrandKit MCP parser pipeline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseCSSFile, extractColorsFromCSS, extractTypographyFromCSS } from '../parsers/css-parser.js';
import { parseGuidelineMarkdown, parseComponentMarkdown, parsePaletteMarkdown } from '../parsers/markdown-parser.js';
import { parseFontFile, inferFontWeight } from '../parsers/font-parser.js';
import { inferLogoVariantName } from '../parsers/image-parser.js';
import { classifyFileType } from '../scanner/directory-scanner.js';

const TEST_DIR = join(process.cwd(), '__test_fixtures__');

describe('CSS Parser', () => {
  const cssFilePath = join(TEST_DIR, 'test-colors.css');

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(cssFilePath, `:root {
  --color-primary: #1a1a2e;
  --color-secondary: #16213e;
  --color-accent: #e94560;
  --color-success: #28a745;
  --font-size-base: 1rem;
  --font-family-primary: 'Inter', sans-serif;
  --spacing-sm: 0.5rem;
}`);
  });

  it('should parse CSS custom properties', () => {
    const result = parseCSSFile(cssFilePath, 'shared');
    expect(result.customProperties['--color-primary']).toBe('#1a1a2e');
    expect(result.customProperties['--color-secondary']).toBe('#16213e');
    expect(result.customProperties['--color-accent']).toBe('#e94560');
  });

  it('should extract colors from custom properties', () => {
    const result = parseCSSFile(cssFilePath, 'shared');
    const colors = extractColorsFromCSS(result.customProperties, 'shared', cssFilePath);
    expect(colors.length).toBeGreaterThanOrEqual(3);
    const primary = colors.find((c) => c.token === '--color-primary');
    expect(primary).toBeDefined();
    expect(primary!.value).toBe('#1a1a2e');
    expect(primary!.role).toBe('primary');
  });

  it('should extract typography from custom properties', () => {
    const result = parseCSSFile(cssFilePath, 'shared');
    const typo = extractTypographyFromCSS(result.customProperties, 'shared', cssFilePath);
    expect(typo.length).toBeGreaterThanOrEqual(1);
  });

  it('should not extract non-color properties as colors', () => {
    const result = parseCSSFile(cssFilePath, 'shared');
    const colors = extractColorsFromCSS(result.customProperties, 'shared', cssFilePath);
    const spacing = colors.find((c) => c.token === '--spacing-sm');
    expect(spacing).toBeUndefined();
  });
});

describe('Markdown Parser', () => {
  const guidelinePath = join(TEST_DIR, 'brand-voice.md');
  const componentPath = join(TEST_DIR, 'button.md');
  const palettePath = join(TEST_DIR, 'palette.md');

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });

    writeFileSync(guidelinePath, `---
title: Brand Voice
section: brand-voice
---

# Brand Voice Guidelines

Our brand voice is confident, clear, and approachable.

## Tone
We adjust tone based on context.
`);

    writeFileSync(componentPath, `---
name: Button
category: button
variants:
  - Primary
  - Secondary
  - Ghost
---

# Button

A versatile button component for user interactions.

## Usage
Use buttons for primary actions.

## Variants

### Primary
The default button style.

### Secondary
For secondary actions.
`);

    writeFileSync(palettePath, `# Color Palette

| Name | Hex | Description |
|---|---|---|
| Ocean Blue | #0077b6 | Primary brand color |
| Sunset Orange | #e76f51 | Accent color |
`);
  });

  it('should parse guideline markdown with frontmatter', () => {
    const result = parseGuidelineMarkdown(guidelinePath, 'shared');
    expect(result.title).toBe('Brand Voice');
    expect(result.section).toBe('brand-voice');
    expect(result.content).toContain('confident, clear, and approachable');
  });

  it('should parse component markdown', () => {
    const results = parseComponentMarkdown(componentPath, 'shared');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Button');
    expect(results[0].category).toBe('button');
    expect(results[0].variants).toContain('Primary');
  });

  it('should parse palette markdown tables', () => {
    const colors = parsePaletteMarkdown(palettePath, 'shared');
    expect(colors.length).toBe(2);
    expect(colors[0].name).toBe('Ocean Blue');
    expect(colors[0].hex).toBe('#0077b6');
    expect(colors[1].name).toBe('Sunset Orange');
  });
});

describe('Font Parser', () => {
  it('should parse font filename with weight', () => {
    const result = parseFontFile('/fonts/inter-700-normal.woff2');
    expect(result.family).toBe('Inter');
    expect(result.weight).toBe(700);
    expect(result.style).toBe('normal');
  });

  it('should parse font filename with named weight', () => {
    const result = parseFontFile('/fonts/roboto-bold-italic.woff2');
    expect(result.family).toBe('Roboto');
    expect(result.weight).toBe(700);
    expect(result.style).toBe('italic');
  });

  it('should infer font weight from name', () => {
    expect(inferFontWeight('bold')).toBe(700);
    expect(inferFontWeight('light')).toBe(300);
    expect(inferFontWeight('400')).toBe(400);
    expect(inferFontWeight('unknown')).toBeUndefined();
  });
});

describe('Image Parser', () => {
  it('should infer logo variant names', () => {
    expect(inferLogoVariantName('logo-primary.svg')).toBe('Primary');
    expect(inferLogoVariantName('logo-mark.png')).toBe('Mark');
    expect(inferLogoVariantName('logo-wordmark-dark.svg')).toBe('Wordmark Dark');
    expect(inferLogoVariantName('logo.svg')).toBe('Primary');
  });
});

describe('File Classification', () => {
  it('should classify CSS files', () => {
    expect(classifyFileType('styles.css')).toBe('css');
  });

  it('should classify markdown files', () => {
    expect(classifyFileType('guide.md')).toBe('markdown');
  });

  it('should classify image files', () => {
    expect(classifyFileType('logo.svg')).toBe('image');
    expect(classifyFileType('photo.png')).toBe('image');
  });

  it('should classify font files', () => {
    expect(classifyFileType('inter.woff2')).toBe('font');
  });

  it('should classify unknown files', () => {
    expect(classifyFileType('data.json')).toBe('unknown');
    expect(classifyFileType('script.ts')).toBe('unknown');
  });
});

