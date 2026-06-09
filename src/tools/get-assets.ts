import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';
import { coerceContext } from './_context.js';

export const TOOL_NAME = 'get_assets';

export const TOOL_DESCRIPTION =
  'Return logos and other binary assets from agent/visual/assets/. Replaces v1 get_logos + get_textures.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const warnings: string[] = [];
  const ctx = coerceContext(args.context, warnings);
  const list = index[ctx].assets.length ? index[ctx].assets : index.base.assets;
  if (list.length === 0) warnings.push('No assets found');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify({ context: ctx, assets: list, _warnings: warnings }, null, 2),
    },
  ];
}
