import { describe, it, expectTypeOf } from 'vitest';
import type {
  BrandContext,
  VerbalDoc,
  AudienceDoc,
  MotionSystem,
  AssetEntry,
  FontFace,
  TokenSpecimen,
  MagicTrick,
} from '../types/design-system.js';
import type { DesignSystemIndex } from '../indexer/types.js';

describe('v2 types', () => {
  it('BrandContext is base|web|product', () => {
    expectTypeOf<BrandContext>().toEqualTypeOf<'base' | 'web' | 'product'>();
  });
  it('VerbalDoc has frontmatter and body', () => {
    expectTypeOf<VerbalDoc>().toMatchTypeOf<{
      frontmatter: Record<string, unknown>;
      body: string;
      source: string;
    }>();
  });
  it('AudienceDoc is freeform', () => {
    expectTypeOf<AudienceDoc>().toMatchTypeOf<{
      data: unknown;
      source: string;
    }>();
  });
  it('MotionSystem carries json + css text', () => {
    expectTypeOf<MotionSystem>().toMatchTypeOf<{
      tokens: unknown;
      css: string;
      source: string;
    }>();
  });
  it('MagicTrick has content and source', () => {
    expectTypeOf<MagicTrick>().toMatchTypeOf<{ content: string; source: string }>();
  });
  it('AssetEntry has file and format', () => {
    expectTypeOf<AssetEntry>().toMatchTypeOf<{ file: string; format: string; filePath: string }>();
  });
  it('FontFace has family and file', () => {
    expectTypeOf<FontFace>().toMatchTypeOf<{ family: string; file: string; filePath: string }>();
  });
  it('TokenSpecimen has name, value, type', () => {
    expectTypeOf<TokenSpecimen>().toMatchTypeOf<{ name: string; value: string; type: string }>();
  });
});

describe('DesignSystemIndex v2 shape', () => {
  it('has verbal docs keyed by category', () => {
    expectTypeOf<DesignSystemIndex['verbal']>().toMatchTypeOf<{
      positioning: VerbalDoc | undefined;
      audience: AudienceDoc | undefined;
      messaging: VerbalDoc | undefined;
      differentiation: VerbalDoc | undefined;
      concepts: VerbalDoc | undefined;
      voice: VerbalDoc | undefined;
    }>();
  });
  it('has magicTrick and motion', () => {
    expectTypeOf<DesignSystemIndex['magicTrick']>().toMatchTypeOf<MagicTrick | undefined>();
  });
});
