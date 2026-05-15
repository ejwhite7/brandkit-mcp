import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as magicTrick from '../tools/get-magic-trick.js';

describe('get_magic_trick', () => {
  it('returns the file content verbatim', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = magicTrick.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toContain('Specificity beats abstraction');
    expect(parsed.source).toMatch(/magic_trick\.md$/);
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = magicTrick.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toBe('');
    expect(parsed._warnings[0]).toMatch(/magic_trick/);
  });
});
