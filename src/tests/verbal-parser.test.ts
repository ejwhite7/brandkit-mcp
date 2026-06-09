import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseVerbalDoc } from '../parsers/verbal-parser.js';

function md(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-verbal-'));
  const path = join(dir, 'positioning.md');
  writeFileSync(path, content);
  return path;
}

describe('parseVerbalDoc', () => {
  it('parses markdown with frontmatter', () => {
    const path = md('---\nowner: ej\n---\n# Positioning\n\nWe help solo founders.\n');
    const doc = parseVerbalDoc(path);
    expect(doc?.frontmatter.owner).toBe('ej');
    expect(doc?.body).toContain('We help solo founders');
  });

  it('parses markdown without frontmatter', () => {
    const path = md('# Positioning\n\nWe help solo founders.\n');
    const doc = parseVerbalDoc(path);
    expect(doc?.frontmatter).toEqual({});
    expect(doc?.body).toContain('We help solo founders');
  });

  it('returns undefined on missing file', () => {
    expect(parseVerbalDoc('/nonexistent/file.md')).toBeUndefined();
  });

  it('degrades gracefully on malformed frontmatter (tolerance principle)', () => {
    const path = md('---\nbad: : :\n---\n# Positioning\n\nBody text survives.\n');
    const doc = parseVerbalDoc(path);
    expect(doc).toBeDefined();
    expect(doc?.frontmatter).toEqual({});
    expect(doc?.body).toContain('Body text survives');
  });
});
