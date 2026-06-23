import { describe, it, expect } from 'vitest';
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
