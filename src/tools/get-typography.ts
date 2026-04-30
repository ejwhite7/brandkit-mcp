/**
 * @file get-typography.ts
 * @description MCP tool: get_typography
 * Returns typography specifications: font families, sizes, weights,
 * line heights, and usage guidelines per context.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetTypographyArgs } from '../types/mcp.js';
import { typographyToCSSFormat } from '../formatters/css.js';
import { typographyToSCSSFormat } from '../formatters/scss.js';

export const TOOL_NAME = 'get_typography';

export const TOOL_DESCRIPTION =
  'Get typography specifications: font families, sizes, weights, line heights, and usage guidelines per context.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to query' },
    format: { type: 'string', enum: ['json', 'css', 'scss'], default: 'json', description: 'Output format' },
  },
};

/**
 * Handles the get_typography tool call.
 */
export function handler(index: DesignSystemIndex, args: GetTypographyArgs) {
  const ctx = args.context ?? 'all';
  const resolved = ctx === 'all' ? index.resolved.all :
    ctx === 'marketing' ? index.resolved.marketing :
    ctx === 'product' ? index.resolved.product :
    index.resolved.all;

  const typography = resolved.typography;

  if (typography.length === 0) {
    return [{ type: 'text' as const, text: `No typography specifications found in ${ctx} context.` }];
  }

  switch (args.format) {
    case 'css':
      return [{ type: 'text' as const, text: typographyToCSSFormat(typography) }];
    case 'scss':
      return [{ type: 'text' as const, text: typographyToSCSSFormat(typography) }];
    default:
      return [{ type: 'text' as const, text: JSON.stringify(typography, null, 2) }];
  }
}

