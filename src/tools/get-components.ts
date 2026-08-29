/**
 * @file get-components.ts
 * @description MCP tool: get_components
 * Returns component specifications from agent/visual/components/.
 * Supports filtering by context (base | web | product) and name.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';
import { coerceContext } from './_context.js';

export const TOOL_NAME = 'get_components';

export const TOOL_DESCRIPTION =
  'Return UI component specifications from agent/visual/components/. Optionally filtered by context (base | web | product).';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
    name: { type: 'string', description: 'Filter to a single component by name' },
  },
};

/**
 * Handles the get_components tool call.
 */
export function handler(
  index: DesignSystemIndex,
  args: { context?: BrandContext; name?: string },
) {
  const warnings: string[] = [];
  const ctx = coerceContext(args.context, warnings);

  const list = index.contexts[ctx].components;

  let filtered = list;
  if (typeof args.name === 'string' && args.name.length > 0) {
    const name = args.name;
    filtered = filtered.filter((c) => c.name.toLowerCase() === name.toLowerCase());
    if (filtered.length === 0) warnings.push(`No component named "${name}" in ${ctx} context`);
  } else if (filtered.length === 0) {
    warnings.push('No components found');
  }

  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        { context: ctx, components: filtered, _warnings: warnings },
        null,
        2,
      ),
    },
  ];
}
