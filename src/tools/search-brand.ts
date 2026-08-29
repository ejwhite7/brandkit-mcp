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
/** JSON Schema maxLength counts Unicode code points, not encoded bytes. */
export const MAX_SEARCH_QUERY_CODE_POINTS = 256;
/** The runtime additionally caps the UTF-8 representation used on the wire. */
export const MAX_SEARCH_QUERY_BYTES = 512;
export const MAX_SEARCH_SNIPPET_BYTES = 512;
export const MAX_SEARCH_SOURCE_BYTES = 512;
export const MAX_SEARCH_RESPONSE_BYTES = 256 * 1024;

const INVALID_QUERY_WARNING =
  `Missing or invalid required "query" argument: expected a non-empty string of at most ` +
  `${MAX_SEARCH_QUERY_CODE_POINTS} Unicode code points and ${MAX_SEARCH_QUERY_BYTES} UTF-8 bytes`;

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_SEARCH_QUERY_CODE_POINTS,
      description:
        `Search query (case-insensitive substring; maximum ${MAX_SEARCH_QUERY_CODE_POINTS} Unicode ` +
        `code points and ${MAX_SEARCH_QUERY_BYTES} UTF-8 bytes)`,
    },
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

function isValidSearchQuery(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;

  // Check bytes first so a very large hostile string is rejected without
  // materializing an equally large code-point array.
  if (Buffer.byteLength(value, 'utf8') > MAX_SEARCH_QUERY_BYTES) return false;

  let codePoints = 0;
  const iterator = value[Symbol.iterator]();
  for (let next = iterator.next(); !next.done; next = iterator.next()) {
    const unit = next.value.charCodeAt(0);
    if (next.value.length === 1 && unit >= 0xd800 && unit <= 0xdfff) return false;
    codePoints += 1;
    if (codePoints > MAX_SEARCH_QUERY_CODE_POINTS) return false;
  }
  return true;
}

function takeUtf8Slice(value: string, start: number, maxBytes: number): { text: string; codeUnits: number } {
  let text = '';
  let bytes = 0;
  let codeUnits = 0;
  let cursor = start;

  while (cursor < value.length) {
    const codePoint = String.fromCodePoint(value.codePointAt(cursor) as number);
    const codePointBytes = Buffer.byteLength(codePoint, 'utf8');
    if (bytes + codePointBytes > maxBytes) break;
    text += codePoint;
    bytes += codePointBytes;
    codeUnits += codePoint.length;
    cursor += codePoint.length;
  }

  return { text, codeUnits };
}

function takeUtf8Prefix(value: string, maxBytes: number): { text: string; codeUnits: number } {
  return takeUtf8Slice(value, 0, maxBytes);
}

function boundedUtf8Text(value: string, maxBytes: number): string {
  const ellipsis = '…';
  const full = takeUtf8Prefix(value, maxBytes);
  if (full.codeUnits === value.length) return value;
  const prefix = takeUtf8Prefix(value, maxBytes - Buffer.byteLength(ellipsis, 'utf8'));
  return `${prefix.text}${ellipsis}`;
}

function moveBackCodePoints(value: string, from: number, count: number): number {
  let cursor = Math.min(Math.max(0, from), value.length);
  // Never begin a slice between a UTF-16 surrogate pair.
  if (
    cursor > 0 &&
    cursor < value.length &&
    value.charCodeAt(cursor) >= 0xdc00 &&
    value.charCodeAt(cursor) <= 0xdfff &&
    value.charCodeAt(cursor - 1) >= 0xd800 &&
    value.charCodeAt(cursor - 1) <= 0xdbff
  ) {
    cursor -= 1;
  }

  while (cursor > 0 && count > 0) {
    cursor -= 1;
    if (
      cursor > 0 &&
      value.charCodeAt(cursor) >= 0xdc00 &&
      value.charCodeAt(cursor) <= 0xdfff &&
      value.charCodeAt(cursor - 1) >= 0xd800 &&
      value.charCodeAt(cursor - 1) <= 0xdbff
    ) {
      cursor -= 1;
    }
    count -= 1;
  }
  return cursor;
}

function makeSnippet(value: string, matchIndex: number): string {
  const ellipsis = '…';
  const ellipsisBytes = Buffer.byteLength(ellipsis, 'utf8');
  const start = moveBackCodePoints(value, matchIndex, 40);
  const leading = start > 0 ? ellipsis : '';

  // Reserve a trailing ellipsis. The fixed byte budget deliberately does not
  // depend on query length, and iteration never splits a surrogate pair.
  const available = MAX_SEARCH_SNIPPET_BYTES - Buffer.byteLength(leading, 'utf8') - ellipsisBytes;
  const body = takeUtf8Slice(value, start, available);
  const trailing = start + body.codeUnits < value.length ? ellipsis : '';
  return `${leading}${body.text}${trailing}`;
}

function serializeSearchResponse(query: string, results: SearchHit[], warnings: string[]): string {
  let retained = results;
  let responseWarnings = warnings;
  let serialized = JSON.stringify({ query, results: retained, _warnings: responseWarnings }, null, 2);

  if (Buffer.byteLength(serialized, 'utf8') <= MAX_SEARCH_RESPONSE_BYTES) return serialized;

  responseWarnings = [...warnings, 'Some lower-ranked matches were omitted to keep the response within its byte limit'];
  let lowerBound = 0;
  let upperBound = results.length;
  while (lowerBound < upperBound) {
    const candidateLength = Math.ceil((lowerBound + upperBound) / 2);
    const candidate = JSON.stringify(
      { query, results: results.slice(0, candidateLength), _warnings: responseWarnings },
      null,
      2,
    );
    if (Buffer.byteLength(candidate, 'utf8') <= MAX_SEARCH_RESPONSE_BYTES) {
      lowerBound = candidateLength;
    } else {
      upperBound = candidateLength - 1;
    }
  }
  retained = results.slice(0, lowerBound);
  serialized = JSON.stringify({ query, results: retained, _warnings: responseWarnings }, null, 2);

  // Query validation and the fixed warning text make this fallback far below
  // the ceiling even if a future hit field is accidentally made unbounded.
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SEARCH_RESPONSE_BYTES) {
    return JSON.stringify({ query: null, results: [], _warnings: [INVALID_QUERY_WARNING] }, null, 2);
  }
  return serialized;
}

export function handler(
  index: DesignSystemIndex,
  args: { query?: unknown; limit?: unknown },
) {
  const limit = resolveSearchLimit(args.limit);

  if (!isValidSearchQuery(args.query)) {
    return [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { query: null, results: [], _warnings: [INVALID_QUERY_WARNING] },
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
    hits.push({
      ...base,
      source: base.source === undefined ? undefined : boundedUtf8Text(base.source, MAX_SEARCH_SOURCE_BYTES),
      snippet: makeSnippet(text, idx),
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
      text: serializeSearchResponse(args.query, results, warnings),
    },
  ];
}
