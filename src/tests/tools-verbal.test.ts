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

import * as positioning from '../tools/get-positioning.js';

describe('get_positioning', () => {
  it('returns the parsed positioning doc with a taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = positioning.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toContain('solo founders');
    expect(parsed._taste_primer).toContain('Specificity');
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when the file is missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = positioning.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toBe('');
    expect(parsed._warnings).toEqual([
      'No positioning document found at agent/verbal/positioning.md',
    ]);
  });
});

import * as messaging from '../tools/get-messaging.js';

describe('get_messaging', () => {
  it('returns the parsed messaging doc with a taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = messaging.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toContain('Ship on-brand');
    expect(parsed._taste_primer).toContain('Specificity');
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when the file is missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = messaging.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toBe('');
    expect(parsed._warnings).toEqual([
      'No messaging document found at agent/verbal/messaging.md',
    ]);
  });
});

import * as differentiation from '../tools/get-differentiation.js';

describe('get_differentiation', () => {
  it('returns the parsed differentiation doc with a taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = differentiation.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toContain('LLMs the brand');
    expect(parsed._taste_primer).toContain('Specificity');
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when the file is missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = differentiation.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toBe('');
    expect(parsed._warnings).toEqual([
      'No differentiation document found at agent/verbal/differentiation.md',
    ]);
  });
});

import * as concepts from '../tools/get-concepts.js';

describe('get_concepts', () => {
  it('returns the parsed concepts doc with a taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = concepts.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toContain('Atomic system');
    expect(parsed._taste_primer).toContain('Specificity');
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when the file is missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = concepts.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toBe('');
    expect(parsed._warnings).toEqual([
      'No concepts document found at agent/verbal/concepts.md',
    ]);
  });
});

import * as voice from '../tools/get-voice.js';

describe('get_voice', () => {
  it('returns the parsed voice doc with a taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = voice.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toContain('Plainspoken');
    expect(parsed._taste_primer).toContain('Specificity');
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when the file is missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = voice.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toBe('');
    expect(parsed._warnings).toEqual([
      'No voice document found at agent/verbal/voice.md',
    ]);
  });
});

import * as audience from '../tools/get-audience.js';

describe('get_audience', () => {
  it('returns parsed YAML with a taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = audience.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.data.personas).toHaveLength(1);
    expect(parsed._taste_primer).toContain('Specificity');
    expect(parsed._warnings).toEqual([]);
  });

  it('warns when missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = audience.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.data).toBeNull();
    expect(parsed._warnings[0]).toMatch(/audience/);
  });
});
