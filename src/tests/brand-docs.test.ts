import { describe, it, expect } from 'vitest';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BrandKitConfigSchema } from '../types/config.js';
import {
  isBriefComplete,
  missingBriefQuestions,
  fillBriefPlaceholders,
  BRIEF_QUESTIONS,
  BRIEF_PLACEHOLDER,
} from '../brand-docs/brief.js';
import { buildFixtureIndex } from './helpers.js';
import { generateBrandDocs, bullets } from '../brand-docs/generate.js';
import { regenerateBrandDocsIfReady } from '../brand-docs/regenerate.js';

describe('config brief block', () => {
  it('parses an optional brief with four string fields', () => {
    const cfg = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Acme' },
      brief: {
        audience: 'solo founders between meetings',
        voice_words: 'warm, mechanical, opinionated',
        visual_references: 'Klim specimen pages',
        anti_references: 'generic SaaS dashboards',
      },
    });
    expect(cfg.brief?.audience).toContain('solo founders');
  });

  it('allows config with no brief', () => {
    const cfg = BrandKitConfigSchema.parse({ version: 2, brand: { name: 'Acme' } });
    expect(cfg.brief).toBeUndefined();
  });
});

describe('brief helpers', () => {
  const full = {
    audience: 'a',
    voice_words: 'b',
    visual_references: 'c',
    anti_references: 'd',
  };

  it('isBriefComplete is true only when all four are non-empty', () => {
    expect(isBriefComplete(full)).toBe(true);
    expect(isBriefComplete({ ...full, anti_references: '   ' })).toBe(false);
    expect(isBriefComplete(undefined)).toBe(false);
    expect(isBriefComplete({})).toBe(false);
  });

  it('missingBriefQuestions returns the questions for empty fields', () => {
    const missing = missingBriefQuestions({ audience: 'a' });
    expect(missing).toHaveLength(3);
    expect(missing.join(' ')).toContain('three words');
    expect(BRIEF_QUESTIONS).toHaveLength(4);
  });

  it('fillBriefPlaceholders fills only empty fields', () => {
    const filled = fillBriefPlaceholders({ audience: 'real audience' });
    expect(filled.audience).toBe('real audience');
    expect(filled.voice_words).toBe(BRIEF_PLACEHOLDER);
  });
});

import {
  updateFileWithDelimiters,
  writeBrandDocs,
  DELIMITER_START,
  DELIMITER_END,
} from '../brand-docs/write.js';

describe('updateFileWithDelimiters', () => {
  it('creates a new file with a delimited block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    updateFileWithDelimiters(file, 'HELLO');
    const text = readFileSync(file, 'utf-8');
    expect(text).toContain(DELIMITER_START);
    expect(text).toContain('HELLO');
    expect(text).toContain(DELIMITER_END);
  });

  it('replaces only the delimited region, preserving outside content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    writeFileSync(
      file,
      `TOP\n${DELIMITER_START}\nOLD\n${DELIMITER_END}\nBOTTOM\n`,
      'utf-8',
    );
    updateFileWithDelimiters(file, 'NEW');
    const text = readFileSync(file, 'utf-8');
    expect(text).toContain('TOP');
    expect(text).toContain('BOTTOM');
    expect(text).toContain('NEW');
    expect(text).not.toContain('OLD');
  });

  it('appends a block when the file has no delimiters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    writeFileSync(file, 'USER CONTENT\n', 'utf-8');
    updateFileWithDelimiters(file, 'GENERATED');
    const text = readFileSync(file, 'utf-8');
    expect(text).toContain('USER CONTENT');
    expect(text).toContain('GENERATED');
  });

  it.each([
    ['no final newline', 'USER CONTENT   '],
    ['one final newline', 'USER CONTENT   \n'],
    ['multiple final newlines', 'USER CONTENT   \n\n\n'],
  ])('preserves zero-marker human bytes when appending after %s', (_name, humanContent) => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    writeFileSync(file, humanContent, 'utf-8');

    updateFileWithDelimiters(file, 'GENERATED');

    expect(readFileSync(file, 'utf-8').slice(0, humanContent.length)).toBe(humanContent);
  });

  it.each([
    ['missing end', `${DELIMITER_START}\nmanaged`],
    ['missing start', `managed\n${DELIMITER_END}`],
    ['reversed', `${DELIMITER_END}\nmanaged\n${DELIMITER_START}`],
    ['duplicate start', `${DELIMITER_START}\n${DELIMITER_START}\n${DELIMITER_END}`],
    ['duplicate end', `${DELIMITER_START}\n${DELIMITER_END}\n${DELIMITER_END}`],
    [
      'nested pairs',
      `${DELIMITER_START}\n${DELIMITER_START}\nmanaged\n${DELIMITER_END}\n${DELIMITER_END}`,
    ],
    [
      'multiple pairs',
      `${DELIMITER_START}\none\n${DELIMITER_END}\n${DELIMITER_START}\ntwo\n${DELIMITER_END}`,
    ],
  ])('rejects %s marker topology without changing the file', (_name, original) => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    writeFileSync(file, original, 'utf-8');

    expect(() => updateFileWithDelimiters(file, 'GENERATED')).toThrow(
      /ambiguous brandkit-mcp delimiters/,
    );
    expect(readFileSync(file, 'utf-8')).toBe(original);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it.each(['CLAUDE.md', 'AGENTS.md', 'SKILLS.md', 'DESIGN.md', 'PRODUCT.md'])(
    'rejects reserved delimiters in generated content for %s before creating output',
    (filename) => {
      const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
      const file = join(dir, filename);

      expect(() => updateFileWithDelimiters(file, `source ${DELIMITER_START} injection`)).toThrow(
        /Generated content contains a reserved brandkit-mcp delimiter/,
      );
      expect(existsSync(file)).toBe(false);
      expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    },
  );

  it('atomically replaces regular files while preserving their permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    writeFileSync(file, 'USER CONTENT\n', { mode: 0o640 });
    const before = lstatSync(file);

    updateFileWithDelimiters(file, 'GENERATED');

    const after = lstatSync(file);
    expect(after.ino).not.toBe(before.ino);
    expect(after.mode & 0o777).toBe(0o640);
    expect(readFileSync(file, 'utf-8')).toContain('USER CONTENT');
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses output symlinks without changing their relative or absolute targets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const externalDir = mkdtempSync(join(tmpdir(), 'bk-protected-'));
    const magic = join(dir, 'magic_trick.md');
    const external = join(externalDir, 'external.md');
    writeFileSync(magic, 'MAGIC MUST STAY\n');
    writeFileSync(external, 'EXTERNAL MUST STAY\n');

    symlinkSync('magic_trick.md', join(dir, 'DESIGN.md'));
    expect(() => updateFileWithDelimiters(join(dir, 'DESIGN.md'), 'PWNED')).toThrow(
      /symbolic-link output/,
    );
    symlinkSync(external, join(dir, 'PRODUCT.md'));
    expect(() => updateFileWithDelimiters(join(dir, 'PRODUCT.md'), 'PWNED')).toThrow(
      /symbolic-link output/,
    );

    expect(readFileSync(magic, 'utf-8')).toBe('MAGIC MUST STAY\n');
    expect(readFileSync(external, 'utf-8')).toBe('EXTERNAL MUST STAY\n');
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses non-regular outputs and a symlink output directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    mkdirSync(join(dir, 'DESIGN.md'));
    expect(() => updateFileWithDelimiters(join(dir, 'DESIGN.md'), 'NO')).toThrow(
      /non-regular output/,
    );

    const parent = mkdtempSync(join(tmpdir(), 'bk-write-parent-'));
    symlinkSync(dir, join(parent, 'linked-output'));
    expect(() =>
      updateFileWithDelimiters(join(parent, 'linked-output', 'PRODUCT.md'), 'NO'),
    ).toThrow(/symbolic link as the output directory/);
  });

  it('refuses a hard-linked output without changing protected content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const protectedFile = join(dir, 'magic_trick.md');
    writeFileSync(protectedFile, 'PROTECTED\n');
    linkSync(protectedFile, join(dir, 'DESIGN.md'));

    expect(() => updateFileWithDelimiters(join(dir, 'DESIGN.md'), 'PWNED')).toThrow(
      /hard-linked output/,
    );
    expect(readFileSync(protectedFile, 'utf-8')).toBe('PROTECTED\n');
  });
});

describe('writeBrandDocs', () => {
  it('writes DESIGN.md and PRODUCT.md and returns their paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const { designPath, productPath } = writeBrandDocs(dir, {
      design: 'D',
      product: 'P',
    });
    expect(existsSync(designPath)).toBe(true);
    expect(existsSync(productPath)).toBe(true);
    expect(readFileSync(designPath, 'utf-8')).toContain('D');
    expect(readFileSync(productPath, 'utf-8')).toContain('P');
  });

  it('preflights both protected outputs before changing either file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const magic = join(dir, 'magic_trick.md');
    writeFileSync(join(dir, 'DESIGN.md'), 'ORIGINAL DESIGN\n');
    chmodSync(join(dir, 'DESIGN.md'), 0o644);
    writeFileSync(magic, 'ORIGINAL MAGIC\n');
    symlinkSync('magic_trick.md', join(dir, 'PRODUCT.md'));

    expect(() => writeBrandDocs(dir, { design: 'NEW', product: 'PWNED' })).toThrow(
      /symbolic-link output PRODUCT\.md/,
    );
    expect(readFileSync(join(dir, 'DESIGN.md'), 'utf-8')).toBe('ORIGINAL DESIGN\n');
    expect(readFileSync(magic, 'utf-8')).toBe('ORIGINAL MAGIC\n');
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('preflights both delimiter topologies before staging either output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const designPath = join(dir, 'DESIGN.md');
    const productPath = join(dir, 'PRODUCT.md');
    const originalDesign = 'ORIGINAL DESIGN\n';
    const originalProduct = `${DELIMITER_START}\nBROKEN\n${DELIMITER_START}\n${DELIMITER_END}\n`;
    writeFileSync(designPath, originalDesign);
    writeFileSync(productPath, originalProduct);

    expect(() => writeBrandDocs(dir, { design: 'NEW DESIGN', product: 'NEW PRODUCT' })).toThrow(
      /ambiguous brandkit-mcp delimiters/,
    );
    expect(readFileSync(designPath, 'utf-8')).toBe(originalDesign);
    expect(readFileSync(productPath, 'utf-8')).toBe(originalProduct);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('generateBrandDocs', () => {
  const brief = {
    audience: 'solo founders between meetings',
    voice_words: 'warm, mechanical, opinionated',
    visual_references: 'Klim specimen pages; Linear changelog',
    anti_references: 'generic SaaS dashboards; Material demos',
  };

  it('puts audience + voice + verbal atoms in PRODUCT.md', () => {
    const index = buildFixtureIndex('v2/full');
    const { product } = generateBrandDocs(index, brief);
    expect(product).toContain('Product Brief');
    expect(product).toContain('solo founders between meetings');
    expect(product).toContain('warm, mechanical, opinionated');
    expect(product).toContain('ship marketing pages');
  });

  it('puts references + anti-references + visual atoms in DESIGN.md', () => {
    const index = buildFixtureIndex('v2/full');
    const { design } = generateBrandDocs(index, brief);
    expect(design).toContain('Design Brief');
    expect(design).toContain('Klim specimen pages');
    expect(design).toContain('generic SaaS dashboards');
    expect(design).toContain('Anti-references');
    expect(design).toContain('Button');
  });

  it('does not throw and notes absence when atoms are missing (empty fixture)', () => {
    const index = buildFixtureIndex('v2/empty');
    const { design, product } = generateBrandDocs(index, brief);
    expect(product).toContain('Product Brief');
    expect(design).toContain('Design Brief');
    expect(product).toContain('Not defined in the brand atomic system');
  });

  it.each(['audience', 'voice_words', 'visual_references', 'anti_references'] as const)(
    'rejects a delimiter injected through brief.%s before writing either document',
    (field) => {
      const dir = mkdtempSync(join(tmpdir(), 'bk-generated-injection-'));
      const injectedBrief = { ...brief, [field]: `authored ${DELIMITER_START} text` };
      const docs = generateBrandDocs(buildFixtureIndex('v2/full'), injectedBrief);

      expect(() => writeBrandDocs(dir, docs)).toThrow(/Generated content contains a reserved/);
      expect(existsSync(join(dir, 'DESIGN.md'))).toBe(false);
      expect(existsSync(join(dir, 'PRODUCT.md'))).toBe(false);
      expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    },
  );

  it.each([
    [
      'brand name',
      (index: ReturnType<typeof buildFixtureIndex>) => {
        index.brandName = DELIMITER_END;
      },
    ],
    [
      'verbal body',
      (index: ReturnType<typeof buildFixtureIndex>) => {
        if (index.verbal.positioning) index.verbal.positioning.body = DELIMITER_START;
      },
    ],
    [
      'audience data',
      (index: ReturnType<typeof buildFixtureIndex>) => {
        if (index.verbal.audience) index.verbal.audience.data = { injected: DELIMITER_END };
      },
    ],
    [
      'color token value',
      (index: ReturnType<typeof buildFixtureIndex>) => {
        if (index.base.colorsAndType) {
          index.base.colorsAndType.customProperties['--injected'] = DELIMITER_START;
        }
      },
    ],
    [
      'font family',
      (index: ReturnType<typeof buildFixtureIndex>) => {
        index.base.fonts[0].family = DELIMITER_END;
      },
    ],
    [
      'component description',
      (index: ReturnType<typeof buildFixtureIndex>) => {
        index.base.components[0].description = DELIMITER_START;
      },
    ],
    [
      'motion token name',
      (index: ReturnType<typeof buildFixtureIndex>) => {
        if (index.base.motion) index.base.motion.tokens = { [DELIMITER_END]: 'injected' };
      },
    ],
  ] as const)('rejects a delimiter injected through representative %s source content', (_name, inject) => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-generated-injection-'));
    const index = buildFixtureIndex('v2/full');
    inject(index);

    expect(() => writeBrandDocs(dir, generateBrandDocs(index, brief))).toThrow(
      /Generated content contains a reserved/,
    );
    expect(existsSync(join(dir, 'DESIGN.md'))).toBe(false);
    expect(existsSync(join(dir, 'PRODUCT.md'))).toBe(false);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('bullets', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(bullets('')).toBe('');
    expect(bullets('   ')).toBe('');
  });

  it('returns the cleaned single item without trailing delimiter', () => {
    expect(bullets('Stripe; ')).toBe('Stripe');
    expect(bullets('Linear')).toBe('Linear');
  });

  it('renders multiple items as a bullet list', () => {
    expect(bullets('Klim; Linear')).toBe('- Klim\n- Linear');
    expect(bullets('a\nb')).toBe('- a\n- b');
  });
});

describe('regenerateBrandDocsIfReady', () => {
  const fullBrief = {
    audience: 'a',
    voice_words: 'b',
    visual_references: 'c',
    anti_references: 'd',
  };

  it('writes both files when the brief is complete', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-regen-'));
    const index = buildFixtureIndex('v2/full');
    const result = regenerateBrandDocsIfReady(index, fullBrief, dir);
    expect(result.written).toBe(true);
    expect(existsSync(join(dir, 'DESIGN.md'))).toBe(true);
    expect(existsSync(join(dir, 'PRODUCT.md'))).toBe(true);
  });

  it('skips and reports when the brief is incomplete', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-regen-'));
    const index = buildFixtureIndex('v2/full');
    const result = regenerateBrandDocsIfReady(index, { audience: 'a' }, dir);
    expect(result.written).toBe(false);
    expect(result.reason).toBe('brief-incomplete');
    expect(existsSync(join(dir, 'DESIGN.md'))).toBe(false);
  });

  it('refuses a startup regeneration symlink without changing its protected target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-regen-'));
    const index = buildFixtureIndex('v2/full');
    const magic = join(dir, 'magic_trick.md');
    writeFileSync(magic, 'STARTUP PROTECTED\n');
    symlinkSync('magic_trick.md', join(dir, 'DESIGN.md'));

    expect(() => regenerateBrandDocsIfReady(index, fullBrief, dir)).toThrow(
      /symbolic-link output DESIGN\.md/,
    );
    expect(readFileSync(magic, 'utf-8')).toBe('STARTUP PROTECTED\n');
    expect(existsSync(join(dir, 'PRODUCT.md'))).toBe(false);
  });
});

describe('brand-docs delimiter round-trip', () => {
  const fullBrief = {
    audience: 'a',
    voice_words: 'b',
    visual_references: 'c',
    anti_references: 'd',
  };

  it('is byte-idempotent and preserves human content on both sides across regenerations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-roundtrip-'));
    const index = buildFixtureIndex('v2/full');
    // First generation.
    regenerateBrandDocsIfReady(index, fullBrief, dir);
    const designPath = join(dir, 'DESIGN.md');
    const withHuman =
      'human prefix with spaces   \n\n' +
      readFileSync(designPath, 'utf-8') +
      '\n## Human notes\nkeep me   \n\n';
    writeFileSync(designPath, withHuman, 'utf-8');
    regenerateBrandDocsIfReady(index, fullBrief, dir);
    const afterSecondRun = readFileSync(designPath, 'utf-8');
    expect(afterSecondRun.startsWith('human prefix with spaces   \n\n')).toBe(true);
    expect(afterSecondRun.endsWith('\n## Human notes\nkeep me   \n\n')).toBe(true);

    regenerateBrandDocsIfReady(index, fullBrief, dir);
    expect(readFileSync(designPath, 'utf-8')).toBe(afterSecondRun);
  });
});
