/**
 * @file parsers.test.ts
 * @description Unit tests for the BrandKit MCP parser pipeline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseCSSFile } from '../parsers/css-parser.js';
import { parseComponentMarkdown } from '../parsers/markdown-parser.js';
import { parseFontFile, inferFontWeight } from '../parsers/font-parser.js';
import { BrandReadPolicy } from '../filesystem/brand-read-policy.js';

const TEST_DIR = join(process.cwd(), '__test_fixtures__');
const reader = new BrandReadPolicy(TEST_DIR);

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
    const result = parseCSSFile(cssFilePath, 'base', reader);
    expect(result.customProperties['--color-primary']).toBe('#1a1a2e');
    expect(result.customProperties['--color-secondary']).toBe('#16213e');
    expect(result.customProperties['--color-accent']).toBe('#e94560');
  });
});

describe('Markdown Parser', () => {
  const componentPath = join(TEST_DIR, 'button.md');

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });

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
  });

  it('should parse component markdown', () => {
    const results = parseComponentMarkdown(componentPath, 'base', reader);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Button');
    expect(results[0].category).toBe('button');
    expect(results[0].variants).toContain('Primary');
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

describe('component usage section extraction', () => {
  it('captures multi-line Usage sections, not just the first line', () => {
    const dir = TEST_DIR;
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'button-multiline.md');
    writeFileSync(
      path,
      '---\nname: Button\n---\n# Button\n\n## Usage\nLine one.\nLine two.\n\n## Other\nIgnored.\n',
    );
    const [component] = parseComponentMarkdown(path, 'base', reader);
    expect(component.usage).toContain('Line one.');
    expect(component.usage).toContain('Line two.');
    expect(component.usage).not.toContain('Ignored');
  });

  it('does not leak the next section into an empty Usage section', () => {
    const dir = TEST_DIR;
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'button-empty-usage.md');
    writeFileSync(
      path,
      '---\nname: Button\n---\n# Button\n\n## Usage\n## Other\nIgnored.\n',
    );
    const [component] = parseComponentMarkdown(path, 'base', reader);
    expect(component.usage ?? '').not.toContain('Ignored');
  });
});
