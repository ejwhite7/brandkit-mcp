import { describe, it, expect } from 'vitest';
import { attachTastePrimer } from '../tools/_taste-primer.js';
import { buildFixtureIndex } from './helpers.js';

describe('attachTastePrimer', () => {
  it('adds _taste_primer with magic_trick contents', () => {
    const idx = buildFixtureIndex('v2/full');
    const out = attachTastePrimer({ content: 'hi' }, idx) as { _taste_primer?: string };
    expect(out._taste_primer).toContain('Specificity beats abstraction');
  });

  it('adds _taste_primer: null when magic_trick.md missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const out = attachTastePrimer({ content: 'hi' }, idx) as { _taste_primer?: string | null };
    expect(out._taste_primer).toBeNull();
  });
});
