import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
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
});
