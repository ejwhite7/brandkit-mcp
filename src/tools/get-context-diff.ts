/**
 * @file get-context-diff.ts
 * @description MCP tool: get_context_diff
 * Diffs two canonical contexts across CSS properties, components, tokens,
 * assets, fonts, and motion.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';
import { coerceContext } from './_context.js';
import { contextItemKeys } from '../context-resolver.js';

export const TOOL_NAME = 'get_context_diff';

export const TOOL_DESCRIPTION =
  'Diff two contexts (base | web | product) across colors_and_type custom properties, components, tokens, assets, fonts, and motion.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    a: { type: 'string', enum: ['base', 'web', 'product'], default: 'web' },
    b: { type: 'string', enum: ['base', 'web', 'product'], default: 'product' },
  },
};

interface DiffEntry { name: string; a?: string; b?: string }

function keyedDiff<T>(
  a: T[],
  b: T[],
  key: (item: T) => string,
  label: (item: T) => string,
): { onlyInA: string[]; onlyInB: string[]; changed: string[] } {
  const mapA = new Map(a.map((item) => [key(item), item]));
  const mapB = new Map(b.map((item) => [key(item), item]));
  return {
    onlyInA: [...mapA].filter(([identity]) => !mapB.has(identity)).map(([, item]) => label(item)),
    onlyInB: [...mapB].filter(([identity]) => !mapA.has(identity)).map(([, item]) => label(item)),
    changed: [...mapA].filter(
      ([identity, item]) => mapB.has(identity) && JSON.stringify(item) !== JSON.stringify(mapB.get(identity)),
    ).map(([, item]) => label(item)),
  };
}

export function handler(
  index: DesignSystemIndex,
  args: { a?: BrandContext; b?: BrandContext },
) {
  const warnings: string[] = [];
  const a = args.a == null ? 'web' : coerceContext(args.a, warnings);
  const b = args.b == null ? 'product' : coerceContext(args.b, warnings);

  // Custom properties (colors_and_type)
  const contextA = index.contexts[a];
  const contextB = index.contexts[b];
  const propsA = contextA.colorsAndType?.customProperties ?? {};
  const propsB = contextB.colorsAndType?.customProperties ?? {};
  const allKeys = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);
  const changed: DiffEntry[] = [];
  const onlyInA: DiffEntry[] = [];
  const onlyInB: DiffEntry[] = [];
  for (const k of allKeys) {
    if (propsA[k] === undefined) onlyInB.push({ name: k, b: propsB[k] });
    else if (propsB[k] === undefined) onlyInA.push({ name: k, a: propsA[k] });
    else if (propsA[k] !== propsB[k]) changed.push({ name: k, a: propsA[k], b: propsB[k] });
  }

  const componentDiff = keyedDiff(contextA.components, contextB.components, contextItemKeys.component, (item) => item.name);
  const tokenDiff = keyedDiff(contextA.tokens, contextB.tokens, contextItemKeys.token, (item) => item.name);
  const assetDiff = keyedDiff(contextA.assets, contextB.assets, contextItemKeys.asset, (item) => item.id ?? item.file);
  const fontDiff = keyedDiff(
    contextA.fonts,
    contextB.fonts,
    contextItemKeys.font,
    (item) => `${item.family}:${item.weight ?? ''}:${item.style ?? ''}`,
  );

  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          a,
          b,
          customProperties: { changed, onlyInA, onlyInB },
          components: componentDiff,
          tokens: tokenDiff,
          assets: assetDiff,
          fonts: fontDiff,
          motion: {
            changed: JSON.stringify(contextA.motion) !== JSON.stringify(contextB.motion),
          },
          _warnings: warnings,
        },
        null,
        2,
      ),
    },
  ];
}
