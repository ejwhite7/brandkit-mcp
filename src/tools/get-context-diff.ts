/**
 * @file get-context-diff.ts
 * @description MCP tool: get_context_diff
 * Diffs two contexts (base | web | product) across colors_and_type custom
 * properties, components, and tokens.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';
import { coerceContext } from './_context.js';

export const TOOL_NAME = 'get_context_diff';

export const TOOL_DESCRIPTION =
  'Diff two contexts (base | web | product) across colors_and_type custom properties, components, and tokens.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    a: { type: 'string', enum: ['base', 'web', 'product'], default: 'web' },
    b: { type: 'string', enum: ['base', 'web', 'product'], default: 'product' },
  },
};

interface DiffEntry { name: string; a?: string; b?: string }

export function handler(
  index: DesignSystemIndex,
  args: { a?: BrandContext; b?: BrandContext },
) {
  const warnings: string[] = [];
  const a = args.a === undefined ? 'web' : coerceContext(args.a, warnings);
  const b = args.b === undefined ? 'product' : coerceContext(args.b, warnings);

  // Custom properties (colors_and_type)
  const propsA = index[a].colorsAndType?.customProperties ?? index.base.colorsAndType?.customProperties ?? {};
  const propsB = index[b].colorsAndType?.customProperties ?? index.base.colorsAndType?.customProperties ?? {};
  const allKeys = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);
  const changed: DiffEntry[] = [];
  const onlyInA: DiffEntry[] = [];
  const onlyInB: DiffEntry[] = [];
  for (const k of allKeys) {
    if (propsA[k] === undefined) onlyInB.push({ name: k, b: propsB[k] });
    else if (propsB[k] === undefined) onlyInA.push({ name: k, a: propsA[k] });
    else if (propsA[k] !== propsB[k]) changed.push({ name: k, a: propsA[k], b: propsB[k] });
  }

  // Components (override-aware: fall through to base if empty)
  const compsA = (index[a].components.length ? index[a].components : index.base.components).map((c) => c.name);
  const compsB = (index[b].components.length ? index[b].components : index.base.components).map((c) => c.name);
  const compsAOnly = compsA.filter((n) => !compsB.includes(n));
  const compsBOnly = compsB.filter((n) => !compsA.includes(n));

  // Tokens
  const tokensA = (index[a].tokens.length ? index[a].tokens : index.base.tokens).map((t) => t.name);
  const tokensB = (index[b].tokens.length ? index[b].tokens : index.base.tokens).map((t) => t.name);
  const tokensAOnly = tokensA.filter((n) => !tokensB.includes(n));
  const tokensBOnly = tokensB.filter((n) => !tokensA.includes(n));

  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          a,
          b,
          customProperties: { changed, onlyInA, onlyInB },
          components: { onlyInA: compsAOnly, onlyInB: compsBOnly },
          tokens: { onlyInA: tokensAOnly, onlyInB: tokensBOnly },
          _warnings: warnings,
        },
        null,
        2,
      ),
    },
  ];
}
