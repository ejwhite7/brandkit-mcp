/**
 * @file get-context-diff.ts
 * @description MCP tool: get_context_diff
 * Compares marketing site vs product app design systems side-by-side,
 * highlighting differences in colors, typography, and components.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { GetContextDiffArgs } from '../types/mcp.js';

export const TOOL_NAME = 'get_context_diff';

export const TOOL_DESCRIPTION =
  'Compare marketing site vs product app design systems side-by-side, highlighting differences in colors, typography, and components.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    category: { type: 'string', enum: ['colors', 'typography', 'components', 'all'], default: 'all', description: 'Category to compare' },
  },
};

/**
 * Handles the get_context_diff tool call.
 */
export function handler(index: DesignSystemIndex, args: GetContextDiffArgs) {
  const category = args.category ?? 'all';
  const mkt = index.resolved.marketing;
  const prod = index.resolved.product;
  const diff: Record<string, unknown> = {};

  if (category === 'colors' || category === 'all') {
    const mktTokens = new Set(mkt.colors.map((c) => c.token));
    const prodTokens = new Set(prod.colors.map((c) => c.token));

    diff.colors = {
      marketingOnly: mkt.colors.filter((c) => !prodTokens.has(c.token)).map((c) => ({ name: c.name, token: c.token, value: c.value })),
      productOnly: prod.colors.filter((c) => !mktTokens.has(c.token)).map((c) => ({ name: c.name, token: c.token, value: c.value })),
      shared: mkt.colors
        .filter((c) => prodTokens.has(c.token))
        .map((mc) => {
          const pc = prod.colors.find((c) => c.token === mc.token);
          return {
            token: mc.token,
            marketing: mc.value,
            product: pc?.value,
            differs: mc.value !== pc?.value,
          };
        }),
    };
  }

  if (category === 'typography' || category === 'all') {
    const mktNames = new Set(mkt.typography.map((t) => t.token ?? t.name));
    const prodNames = new Set(prod.typography.map((t) => t.token ?? t.name));

    diff.typography = {
      marketingOnly: mkt.typography.filter((t) => !prodNames.has(t.token ?? t.name)).map((t) => ({ name: t.name, fontSize: t.fontSize })),
      productOnly: prod.typography.filter((t) => !mktNames.has(t.token ?? t.name)).map((t) => ({ name: t.name, fontSize: t.fontSize })),
    };
  }

  if (category === 'components' || category === 'all') {
    const mktNames = new Set(mkt.components.map((c) => c.name));
    const prodNames = new Set(prod.components.map((c) => c.name));

    diff.components = {
      marketingOnly: mkt.components.filter((c) => !prodNames.has(c.name)).map((c) => ({ name: c.name, category: c.category })),
      productOnly: prod.components.filter((c) => !mktNames.has(c.name)).map((c) => ({ name: c.name, category: c.category })),
      both: mkt.components.filter((c) => prodNames.has(c.name)).map((c) => c.name),
    };
  }

  return [{ type: 'text' as const, text: JSON.stringify(diff, null, 2) }];
}

