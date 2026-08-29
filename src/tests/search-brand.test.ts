import { describe, expect, it } from 'vitest';
import type { BrandContext, DesignComponent } from '../types/design-system.js';
import type { DesignSystemIndex } from '../indexer/types.js';
import {
  DEFAULT_SEARCH_LIMIT,
  INPUT_SCHEMA,
  MAX_SEARCH_LIMIT,
  MAX_SEARCH_QUERY_BYTES,
  MAX_SEARCH_QUERY_CODE_POINTS,
  MAX_SEARCH_RESPONSE_BYTES,
  MAX_SEARCH_SNIPPET_BYTES,
  MAX_SEARCH_SOURCE_BYTES,
  handler,
} from '../tools/search-brand.js';
import { buildFixtureIndex } from './helpers.js';

const INVALID_LIMITS: Array<[string, unknown]> = [
  ['negative', -1],
  ['fractional', 1.5],
  ['NaN', Number.NaN],
  ['positive infinity', Number.POSITIVE_INFINITY],
  ['negative infinity', Number.NEGATIVE_INFINITY],
  ['string', '20'],
  ['zero', 0],
  ['above maximum', MAX_SEARCH_LIMIT + 1],
  ['huge', Number.MAX_SAFE_INTEGER],
];

function parseResults(index: DesignSystemIndex, limit?: unknown) {
  const [content] = handler(index, limit === undefined
    ? { query: 'bounded-match' }
    : { query: 'bounded-match', limit });
  return JSON.parse(content.text) as {
    results: Array<{ context?: BrandContext; source?: string }>;
  };
}

function matchingComponents(context: BrandContext, count: number): DesignComponent[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `bounded-match-${context}-${index}`,
    category: 'test',
    context,
    source: `${context}/${index}.md`,
  }));
}

function buildLargeIndex(): DesignSystemIndex {
  const index = buildFixtureIndex('v2/full');
  for (const context of ['base', 'web', 'product'] as const) {
    index.contexts[context] = {
      ...index.contexts[context],
      components: matchingComponents(context, 40),
    };
  }
  return index;
}

function parsePayload(index: DesignSystemIndex, args: { query?: unknown; limit?: unknown }) {
  const [content] = handler(index, args);
  return {
    text: content.text,
    payload: JSON.parse(content.text) as {
      query: string | null;
      results: Array<{ context?: BrandContext; source?: string; snippet: string }>;
      _warnings: string[];
    },
  };
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('search_brand result limits', () => {
  it('advertises the same integer contract enforced at runtime', () => {
    expect(INPUT_SCHEMA.properties.limit).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
      default: DEFAULT_SEARCH_LIMIT,
      description: `Maximum results to return (1-${MAX_SEARCH_LIMIT})`,
    });
    expect(INPUT_SCHEMA.properties.query).toEqual({
      type: 'string',
      minLength: 1,
      maxLength: MAX_SEARCH_QUERY_CODE_POINTS,
      description:
        `Search query (case-insensitive substring; maximum ${MAX_SEARCH_QUERY_CODE_POINTS} Unicode ` +
        `code points and ${MAX_SEARCH_QUERY_BYTES} UTF-8 bytes)`,
    });
  });

  it.each(INVALID_LIMITS)('rejects a %s limit at the direct handler boundary', (_name, limit) => {
    const index = buildFixtureIndex('v2/full');
    expect(() => handler(index, { query: 'brand', limit })).toThrow(
      `Invalid "limit" argument: expected an integer from 1 to ${MAX_SEARCH_LIMIT}`,
    );
  });

  it('applies the default and exact lower and upper boundaries', () => {
    const index = buildLargeIndex();
    expect(parseResults(index).results).toHaveLength(DEFAULT_SEARCH_LIMIT);
    expect(parseResults(index, 1).results).toHaveLength(1);
    expect(parseResults(index, MAX_SEARCH_LIMIT).results).toHaveLength(MAX_SEARCH_LIMIT);
  });

  it('keeps the response bounded across every resolved context', () => {
    const results = parseResults(buildLargeIndex(), MAX_SEARCH_LIMIT).results;

    expect(results).toHaveLength(MAX_SEARCH_LIMIT);
    expect(new Set(results.map(({ context }) => context))).toEqual(new Set(['base', 'web', 'product']));
    expect(results.every(({ source }) => source?.endsWith('.md'))).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['wrong type', 42],
    ['empty', ''],
    ['unpaired UTF-16 surrogate', '\ud800'],
    ['over the code-point limit', 'a'.repeat(MAX_SEARCH_QUERY_CODE_POINTS + 1)],
    ['over the UTF-8 byte limit', '🔎'.repeat(Math.floor(MAX_SEARCH_QUERY_BYTES / 4) + 1)],
    ['the former 200 KB amplification query', 'q'.repeat(200 * 1024)],
  ])('returns the same safe payload for a %s query', (_name, query) => {
    const { text, payload } = parsePayload(buildFixtureIndex('v2/full'), { query, limit: MAX_SEARCH_LIMIT });

    expect(payload.query).toBeNull();
    expect(payload.results).toEqual([]);
    expect(payload._warnings).toEqual([
      `Missing or invalid required "query" argument: expected a non-empty string of at most ` +
      `${MAX_SEARCH_QUERY_CODE_POINTS} Unicode code points and ${MAX_SEARCH_QUERY_BYTES} UTF-8 bytes`,
    ]);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(512);
  });

  it('accepts the exact character and independent UTF-8 byte boundaries', () => {
    const index = buildFixtureIndex('v2/full');
    expect(parsePayload(index, { query: 'a'.repeat(MAX_SEARCH_QUERY_CODE_POINTS) }).payload.query)
      .toBe('a'.repeat(MAX_SEARCH_QUERY_CODE_POINTS));
    expect(parsePayload(index, { query: '🔎'.repeat(MAX_SEARCH_QUERY_BYTES / 4) }).payload.query)
      .toBe('🔎'.repeat(MAX_SEARCH_QUERY_BYTES / 4));
  });

  it('caps 100 multibyte hits with long sources and huge matching fields', () => {
    const index = buildFixtureIndex('v2/full');
    const query = '🔎'.repeat(MAX_SEARCH_QUERY_BYTES / 4);
    const hugeField = `${'😀'.repeat(2_000)}${query}${'🌊'.repeat(20_000)}`;
    const hugeSource = `${'路/'.repeat(10_000)}component.md`;

    for (const context of ['base', 'web', 'product'] as const) {
      index.contexts[context] = {
        ...index.contexts[context],
        components: Array.from({ length: 40 }, (_, item) => ({
          name: `component-${context}-${item}`,
          category: 'test',
          description: hugeField,
          context,
          source: `${hugeSource}-${item}`,
        })),
      };
    }

    const { text, payload } = parsePayload(index, { query, limit: MAX_SEARCH_LIMIT });

    expect(payload.results).toHaveLength(MAX_SEARCH_LIMIT);
    expect(new Set(payload.results.map(({ context }) => context))).toEqual(new Set(['base', 'web', 'product']));
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(MAX_SEARCH_RESPONSE_BYTES);
    for (const result of payload.results) {
      expect(Buffer.byteLength(result.snippet, 'utf8')).toBeLessThanOrEqual(MAX_SEARCH_SNIPPET_BYTES);
      expect(Buffer.byteLength(result.source ?? '', 'utf8')).toBeLessThanOrEqual(MAX_SEARCH_SOURCE_BYTES);
      expect(hasUnpairedSurrogate(result.snippet)).toBe(false);
      expect(hasUnpairedSurrogate(result.source ?? '')).toBe(false);
    }
  });

  it('enforces the serialized byte ceiling for maximally escaped hit fields', () => {
    const index = buildFixtureIndex('v2/full');
    const hostileField = `bounded-match${'\u0000'.repeat(20_000)}`;
    const hostileSource = `source-${'\u0000'.repeat(20_000)}`;
    for (const context of ['base', 'web', 'product'] as const) {
      index.contexts[context] = {
        ...index.contexts[context],
        components: Array.from({ length: 40 }, (_, item) => ({
          name: `${context}-${item}`,
          category: 'test',
          description: hostileField,
          context,
          source: hostileSource,
        })),
      };
    }

    const { text, payload } = parsePayload(index, { query: 'bounded-match', limit: MAX_SEARCH_LIMIT });
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.length).toBeLessThan(MAX_SEARCH_LIMIT);
    expect(payload._warnings).toContain(
      'Some lower-ranked matches were omitted to keep the response within its byte limit',
    );
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(MAX_SEARCH_RESPONSE_BYTES);
  });
});
