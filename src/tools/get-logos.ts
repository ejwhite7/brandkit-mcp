/**
 * @file get-logos.ts
 * @description MCP tool: get_logos
 * Returns logo variants with usage guidelines, minimum sizes, clear space
 * rules, and forbidden uses. Optionally returns base64-encoded image data.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetLogosArgs } from '../types/mcp.js';
import { generateBase64DataURI } from '../parsers/image-parser.js';
import { resolve, dirname } from 'path';

export const TOOL_NAME = 'get_logos';

export const TOOL_DESCRIPTION =
  'Get logo variants (primary, mark, wordmark, monochrome) with usage guidelines, minimum sizes, clear space rules, and forbidden uses. Optionally returns base64-encoded image data.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    variant: { type: 'string', description: "Filter by variant name (e.g., 'primary', 'mark', 'wordmark')" },
    format: { type: 'string', enum: ['metadata', 'base64'], default: 'metadata', description: 'Whether to include base64 data' },
  },
};

/**
 * Handles the get_logos tool call.
 */
export async function handler(index: DesignSystemIndex, args: GetLogosArgs) {
  const logos = index.resolved.all.logos;

  let variants = logos.variants;
  if (args.variant) {
    variants = variants.filter((v) => v.name.toLowerCase().includes(args.variant!.toLowerCase()));
  }

  if (variants.length === 0) {
    return [{ type: 'text' as const, text: 'No logo variants found matching the criteria.' }];
  }

  const result: Record<string, unknown> = {
    variants: variants.map((v) => ({
      name: v.name,
      format: v.format,
      width: v.width,
      height: v.height,
      filePath: v.filePath,
    })),
    usageGuidelines: logos.usageGuidelines,
    clearSpace: logos.clearSpace,
    minimumSize: logos.minimumSize,
    forbiddenUsage: logos.forbiddenUsage,
  };

  return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }];
}

