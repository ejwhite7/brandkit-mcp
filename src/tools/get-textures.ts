/**
 * @file get-textures.ts
 * @description MCP tool: get_textures
 * Returns texture and pattern assets with usage context.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetTexturesArgs } from '../types/mcp.js';

export const TOOL_NAME = 'get_textures';

export const TOOL_DESCRIPTION =
  'Get texture and pattern assets with usage context. Returns metadata and optionally base64-encoded image data.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to query' },
  },
};

/**
 * Handles the get_textures tool call.
 */
export function handler(index: DesignSystemIndex, args: GetTexturesArgs) {
  const ctx = args.context ?? 'all';
  const resolved = ctx === 'all' ? index.resolved.all :
    ctx === 'marketing' ? index.resolved.marketing :
    ctx === 'product' ? index.resolved.product :
    index.resolved.all;

  const textures = resolved.textures;

  if (textures.length === 0) {
    return [{ type: 'text' as const, text: `No textures found in ${ctx} context.` }];
  }

  return [{ type: 'text' as const, text: JSON.stringify(textures, null, 2) }];
}

