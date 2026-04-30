/**
 * @file get-css.ts
 * @description MCP tool: get_css
 * Returns raw CSS file contents and extracted custom property definitions.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetCSSArgs } from '../types/mcp.js';

export const TOOL_NAME = 'get_css';

export const TOOL_DESCRIPTION =
  'Get raw CSS file contents and extracted custom property definitions from the design system.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to query' },
    includeRaw: { type: 'boolean', default: false, description: 'Include full raw CSS file contents (can be large)' },
  },
};

/**
 * Handles the get_css tool call.
 */
export function handler(index: DesignSystemIndex, args: GetCSSArgs) {
  const ctx = args.context ?? 'all';
  const resolved = ctx === 'all' ? index.resolved.all :
    ctx === 'marketing' ? index.resolved.marketing :
    ctx === 'product' ? index.resolved.product :
    index.resolved.all;

  const cssFiles = resolved.cssFiles;

  if (cssFiles.length === 0) {
    return [{ type: 'text' as const, text: `No CSS files found in ${ctx} context.` }];
  }

  const output = cssFiles.map((f) => ({
    filePath: f.filePath,
    customProperties: f.customProperties,
    classes: f.classes,
    ...(args.includeRaw ? { rawContent: f.rawContent } : {}),
  }));

  return [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }];
}

