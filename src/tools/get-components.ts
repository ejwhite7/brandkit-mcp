/**
 * @file get-components.ts
 * @description MCP tool: get_components
 * Returns component specifications, variants, CSS properties, and usage guidelines.
 * Supports filtering by context, category, or name.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetComponentsArgs } from '../types/mcp.js';

export const TOOL_NAME = 'get_components';

export const TOOL_DESCRIPTION =
  'Get component specifications, variants, CSS properties, and usage guidelines. Filter by context (marketing vs product) or category.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to query' },
    category: { type: 'string', description: 'Filter by category: button, form, navigation, layout, card, modal, etc.' },
    name: { type: 'string', description: 'Search by component name (partial match, case-insensitive)' },
  },
};

/**
 * Handles the get_components tool call.
 */
export function handler(index: DesignSystemIndex, args: GetComponentsArgs) {
  const ctx = args.context ?? 'all';
  const resolved = ctx === 'all' ? index.resolved.all :
    ctx === 'marketing' ? index.resolved.marketing :
    ctx === 'product' ? index.resolved.product :
    index.resolved.all;

  let components = resolved.components;

  if (args.category) {
    components = components.filter((c) => c.category.toLowerCase() === args.category!.toLowerCase());
  }

  if (args.name) {
    const query = args.name.toLowerCase();
    components = components.filter((c) => c.name.toLowerCase().includes(query));
  }

  if (components.length === 0) {
    return [{ type: 'text' as const, text: `No components found matching the criteria in ${ctx} context.` }];
  }

  return [{ type: 'text' as const, text: JSON.stringify(components, null, 2) }];
}

