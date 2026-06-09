import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseTokenSpecimen } from '../parsers/markdown-parser.js';

function md(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-tok-'));
  const path = join(dir, 'token.md');
  writeFileSync(path, content);
  return path;
}

describe('parseTokenSpecimen', () => {
  it('parses well-formed frontmatter', () => {
    const path = md('---\nname: color-primary\nvalue: "#1a1a2e"\ntype: color\n---\n# color-primary\n');
    const result = parseTokenSpecimen(path);
    expect(result.specimen?.name).toBe('color-primary');
    expect(result.specimen?.value).toBe('#1a1a2e');
    expect(result.warnings).toEqual([]);
  });

  it('warns and returns null when required frontmatter missing', () => {
    const path = md('# title only, no frontmatter\n');
    const result = parseTokenSpecimen(path);
    expect(result.specimen).toBeNull();
    expect(result.warnings.some((w) => /name|value|type/.test(w))).toBe(true);
  });
});

describe('parseTokenSpecimen value edge cases', () => {
  it('accepts a falsy-but-present value (value: 0)', () => {
    const path = md('---\nname: spacing-0\nvalue: 0\ntype: spacing\n---\nZero spacing.\n');
    const { specimen, warnings } = parseTokenSpecimen(path);
    expect(warnings).toEqual([]);
    expect(specimen?.name).toBe('spacing-0');
    expect(specimen?.value).toBe('0');
  });

  it('stringifies numeric values', () => {
    const path = md('---\nname: z-modal\nvalue: 1000\ntype: z-index\n---\n');
    const { specimen } = parseTokenSpecimen(path);
    expect(specimen?.value).toBe('1000');
    expect(typeof specimen?.value).toBe('string');
  });
});
