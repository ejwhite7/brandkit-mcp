import { describe, expect, it } from 'vitest';
import type { BrandContext, DesignComponent } from '../types/design-system.js';
import type { DesignSystemIndex } from '../indexer/types.js';
import {
  DEFAULT_SEARCH_LIMIT,
  INPUT_SCHEMA,
  MAX_SEARCH_LIMIT,
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

describe('search_brand result limits', () => {
  it('advertises the same integer contract enforced at runtime', () => {
    expect(INPUT_SCHEMA.properties.limit).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
      default: DEFAULT_SEARCH_LIMIT,
      description: `Maximum results to return (1-${MAX_SEARCH_LIMIT})`,
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
});
