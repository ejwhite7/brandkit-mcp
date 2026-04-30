/**
 * @file get-colors.ts
 * @description MCP tool: get_colors
 * Returns the color palette with hex values, RGB values, usage guidelines,
 * and semantic roles. Supports context filtering and format selection.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetColorsArgs } from '../types/mcp.js';
import { colorsToCSSFormat } from '../formatters/css.js';
import { colorsToSCSSFormat } from '../formatters/scss.js';
import { colorsToTailwindFormat } from '../formatters/tailwind.js';

export const TOOL_NAME = 'get_colors';

export const TOOL_DESCRIPTION =
  'Get the color palette with hex values, RGB values, usage guidelines, and semantic roles. Supports context filtering (marketing vs product) and output format selection.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to query' },
    role: { type: 'string', description: 'Filter by semantic role: primary, secondary, accent, neutral, error, success, warning, info' },
    format: { type: 'string', enum: ['json', 'css', 'scss', 'tailwind'], default: 'json', description: 'Output format' },
  },
};

/**
 * Handles the get_colors tool call.
 */
export function handler(index: DesignSystemIndex, args: GetColorsArgs) {
  const ctx = args.context ?? 'all';
  const resolved = ctx === 'all' ? index.resolved.all :
    ctx === 'marketing' ? index.resolved.marketing :
    ctx === 'product' ? index.resolved.product :
    index.resolved.all;

  let colors = resolved.colors;

  if (args.role) {
    colors = colors.filter((c) => c.role?.toLowerCase() === args.role!.toLowerCase());
  }

  if (colors.length === 0) {
    return [{ type: 'text' as const, text: `No colors found${args.role ? ` with role "${args.role}"` : ''} in ${ctx} context.` }];
  }

  switch (args.format) {
    case 'css':
      return [{ type: 'text' as const, text: colorsToCSSFormat(colors) }];
    case 'scss':
      return [{ type: 'text' as const, text: colorsToSCSSFormat(colors) }];
    case 'tailwind':
      return [{ type: 'text' as const, text: colorsToTailwindFormat(colors) }];
    default:
      return [{ type: 'text' as const, text: JSON.stringify(colors, null, 2) }];
  }
}

