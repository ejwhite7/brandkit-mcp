/**
 * @file search-brand.ts
 * @description MCP tool: search_brand
 * Full-text search across all brand atomic system content.
 */

import type { DesignSystemIndex } from '../indexer/types.js';

export const TOOL_NAME = 'search_brand';

export const TOOL_DESCRIPTION =
  'Full-text search across all brand atomic system content: verbal docs, magic_trick, components, tokens, assets, fonts, motion, and CSS files.';

export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    query: { type: 'string', description: 'Search query (case-insensitive substring)' },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
      default: DEFAULT_SEARCH_LIMIT,
      description: `Maximum results to return (1-${MAX_SEARCH_LIMIT})`,
    },
  },
  required: ['query'],
};

interface SearchHit {
  source?: string;
  snippet: string;
  score: number;
  kind: 'verbal' | 'magic_trick' | 'component' | 'token' | 'asset' | 'font' | 'motion' | 'css';
  context?: string;
}

function resolveSearchLimit(value: unknown): number {
  const limit = value === undefined ? DEFAULT_SEARCH_LIMIT : value;
  if (typeof limit !== 'number') {
    throw new Error(`Invalid "limit" argument: expected an integer from 1 to ${MAX_SEARCH_LIMIT}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw new Error(`Invalid "limit" argument: expected an integer from 1 to ${MAX_SEARCH_LIMIT}`);
  }
  return limit;
}

export function handler(
  index: DesignSystemIndex,
  args: { query?: unknown; limit?: unknown },
) {
  const limit = resolveSearchLimit(args.limit);

  if (typeof args.query !== 'string' || args.query.length === 0) {
    return [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { query: null, results: [], _warnings: ['Missing or invalid required "query" argument'] },
          null,
          2,
        ),
      },
    ];
  }
  const q = args.query.toLowerCase();
  const warnings: string[] = [];
  const hits: SearchHit[] = [];

  function maybeHit(text: string | undefined, base: Omit<SearchHit, 'snippet' | 'score'>) {
    if (!text) return;
    const lc = text.toLowerCase();
    const idx = lc.indexOf(q);
    if (idx === -1) return;
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + q.length + 40);
    hits.push({
      ...base,
      snippet: (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''),
      score: 1 - idx / Math.max(1, text.length),
    });

    // Retain only candidates that can appear in the response. This bounds
    // intermediate memory even when a large structured source contains many
    // matching components or tokens.
    if (hits.length > limit) {
      hits.sort((a, b) => b.score - a.score);
      hits.length = limit;
    }
  }

  // Verbal docs
  maybeHit(index.verbal.positioning?.body, { kind: 'verbal', source: index.verbal.positioning?.source });
  maybeHit(index.verbal.messaging?.body, { kind: 'verbal', source: index.verbal.messaging?.source });
  maybeHit(index.verbal.differentiation?.body, { kind: 'verbal', source: index.verbal.differentiation?.source });
  maybeHit(index.verbal.concepts?.body, { kind: 'verbal', source: index.verbal.concepts?.source });
  maybeHit(index.verbal.voice?.body, { kind: 'verbal', source: index.verbal.voice?.source });
  if (index.verbal.audience) {
    maybeHit(JSON.stringify(index.verbal.audience.data), { kind: 'verbal', source: index.verbal.audience.source });
  }
  maybeHit(index.magicTrick?.content, { kind: 'magic_trick', source: index.magicTrick?.source });

  for (const ctx of ['base', 'web', 'product'] as const) {
    const bucket = index.contexts[ctx];
    for (const c of bucket.components) {
      const blob = `${c.name} ${c.category ?? ''} ${c.description ?? ''} ${c.usage ?? ''} ${(c.examples ?? []).join(' ')}`;
      maybeHit(blob, { kind: 'component', source: c.source, context: ctx });
    }
    for (const t of bucket.tokens) {
      const blob = `${t.name} ${t.value} ${t.role ?? ''} ${t.body}`;
      maybeHit(blob, { kind: 'token', source: t.source, context: ctx });
    }
    for (const a of bucket.assets) {
      const blob = `${a.id ?? ''} ${a.file} ${a.purpose ?? ''}`;
      maybeHit(blob, { kind: 'asset', source: a.filePath, context: ctx });
    }
    for (const f of bucket.fonts) {
      const blob = `${f.family} ${f.weight ?? ''} ${f.style ?? ''} ${f.file}`;
      maybeHit(blob, { kind: 'font', source: f.filePath, context: ctx });
    }
    if (bucket.colorsAndType?.rawContent) {
      maybeHit(bucket.colorsAndType.rawContent, { kind: 'css', source: bucket.colorsAndType.filePath, context: ctx });
    }
    if (bucket.motion) {
      maybeHit(JSON.stringify(bucket.motion.tokens), { kind: 'motion', source: bucket.motion.source, context: ctx });
      maybeHit(bucket.motion.css, { kind: 'css', source: bucket.motion.source, context: ctx });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const results = hits;

  if (results.length === 0) warnings.push(`No matches for "${args.query}"`);

  return [
    {
      type: 'text' as const,
      text: JSON.stringify({ query: args.query, results, _warnings: warnings }, null, 2),
    },
  ];
}
