/**
 * @file search-brand.ts
 * @description MCP tool: search_brand
 * Full-text search across all design system content.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { SearchBrandArgs } from '../types/mcp.js';
import { searchIndex } from '../indexer/index.js';

export const TOOL_NAME = 'search_brand';

export const TOOL_DESCRIPTION =
  'Full-text search across all design system content: guidelines, component specs, color names, typography definitions, and brand documentation.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    query: { type: 'string', description: 'Search query' },
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to search within' },
    limit: { type: 'number', default: 10, description: 'Maximum number of results to return' },
  },
  required: ['query'],
};

/**
 * Handles the search_brand tool call.
 */
export function handler(index: DesignSystemIndex, args: SearchBrandArgs) {
  const results = searchIndex(args.query, index.searchIndex, args.limit ?? 10, args.context);

  if (results.length === 0) {
    return [{ type: 'text' as const, text: `No results found for "${args.query}".` }];
  }

  const output = results.map((r) => ({
    type: r.type,
    name: r.name,
    context: r.context,
    score: r.score,
    snippet: r.snippet,
    source: r.source,
  }));

  return [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }];
}

