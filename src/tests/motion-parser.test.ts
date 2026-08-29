import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseMotionDir } from '../parsers/motion-parser.js';
import { BrandReadPolicy } from '../filesystem/brand-read-policy.js';

function motionFixture(json: string | null, css: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-motion-'));
  if (json !== null) writeFileSync(join(dir, 'motion.json'), json);
  if (css !== null) writeFileSync(join(dir, 'motion.css'), css);
  return dir;
}

describe('parseMotionDir', () => {
  it('parses both motion.json and motion.css', () => {
    const dir = motionFixture(
      JSON.stringify({ durations: { fast: '120ms' } }),
      ':root { --motion-fast: 120ms }',
    );
    const result = parseMotionDir(dir, new BrandReadPolicy(dir));
    expect(result.tokens).toEqual({ durations: { fast: '120ms' } });
    expect(result.css).toContain('--motion-fast');
    expect(result.warnings).toEqual([]);
  });

  it('returns warning if motion.json missing', () => {
    const dir = motionFixture(null, ':root {}');
    const result = parseMotionDir(dir, new BrandReadPolicy(dir));
    expect(result.tokens).toBeNull();
    expect(result.warnings.some((w) => /motion\.json/.test(w))).toBe(true);
  });

  it('returns warning if motion.json malformed (does not throw)', () => {
    const dir = motionFixture('{not json', ':root {}');
    const result = parseMotionDir(dir, new BrandReadPolicy(dir));
    expect(result.tokens).toBeNull();
    expect(result.warnings.some((w) => /motion\.json/.test(w))).toBe(true);
  });
});
