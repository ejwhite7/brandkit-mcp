/**
 * @file get-tokens.ts
 * @description MCP tool: get_tokens
 * Exports design tokens in a specific format: CSS custom properties, SCSS
 * variables, Tailwind config, W3C Design Tokens format, or JSON.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetTokensArgs } from '../types/mcp.js';
import { toCSSFormat } from '../formatters/css.js';
import { toSCSSFormat } from '../formatters/scss.js';
import { toTailwindFormat } from '../formatters/tailwind.js';
import { toW3CFormat } from '../formatters/w3c-tokens.js';
import { toJSONFormat } from '../formatters/json-tokens.js';

export const TOOL_NAME = 'get_tokens';

export const TOOL_DESCRIPTION =
  'Export design tokens in a specific format: CSS custom properties, SCSS variables, Tailwind config, W3C Design Tokens format, or JSON.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to query' },
    format: { type: 'string', enum: ['css', 'scss', 'tailwind', 'w3c', 'json'], description: 'Output format (required)' },
    category: { type: 'string', enum: ['colors', 'typography', 'all'], default: 'all', description: 'Token category to export' },
  },
  required: ['format'],
};

/**
 * Handles the get_tokens tool call.
 */
export function handler(index: DesignSystemIndex, args: GetTokensArgs) {
  const ctx = args.context ?? 'all';
  const resolved = ctx === 'all' ? index.resolved.all :
    ctx === 'marketing' ? index.resolved.marketing :
    ctx === 'product' ? index.resolved.product :
    index.resolved.all;

  const colors = args.category === 'typography' ? [] : resolved.colors;
  const typography = args.category === 'colors' ? [] : resolved.typography;

  let output: string;
  switch (args.format) {
    case 'css':
      output = toCSSFormat(colors, typography);
      break;
    case 'scss':
      output = toSCSSFormat(colors, typography);
      break;
    case 'tailwind':
      output = toTailwindFormat(colors, typography);
      break;
    case 'w3c':
      output = toW3CFormat(colors, typography);
      break;
    case 'json':
    default:
      output = toJSONFormat(colors, typography);
      break;
  }

  return [{ type: 'text' as const, text: output }];
}

