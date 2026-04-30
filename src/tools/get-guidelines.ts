/**
 * @file get-guidelines.ts
 * @description MCP tool: get_guidelines
 * Returns brand guidelines, voice and tone documentation, accessibility rules,
 * and usage policies as full markdown content.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetGuidelinesArgs } from '../types/mcp.js';

export const TOOL_NAME = 'get_guidelines';

export const TOOL_DESCRIPTION =
  'Get brand guidelines, voice and tone documentation, accessibility rules, and usage policies. Returns full markdown content.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['marketing', 'product', 'shared', 'all'], default: 'all', description: 'Design context to query' },
    section: { type: 'string', description: 'Filter by section: brand-voice, accessibility, logo-usage, typography, colors, general' },
  },
};

/**
 * Handles the get_guidelines tool call.
 */
export function handler(index: DesignSystemIndex, args: GetGuidelinesArgs) {
  const ctx = args.context ?? 'all';
  const resolved = ctx === 'all' ? index.resolved.all :
    ctx === 'marketing' ? index.resolved.marketing :
    ctx === 'product' ? index.resolved.product :
    index.resolved.all;

  let guidelines = resolved.guidelines;

  if (args.section) {
    const section = args.section.toLowerCase();
    guidelines = guidelines.filter((g) => g.section?.toLowerCase().includes(section) || g.title.toLowerCase().includes(section));
  }

  if (guidelines.length === 0) {
    return [{ type: 'text' as const, text: `No guidelines found${args.section ? ` for section "${args.section}"` : ''} in ${ctx} context.` }];
  }

  const output = guidelines.map((g) => ({
    title: g.title,
    section: g.section,
    context: g.context,
    content: g.content,
  }));

  return [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }];
}

