import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';

export const TOOL_NAME = 'get_fonts';

export const TOOL_DESCRIPTION =
  'Return font faces declared in agent/visual/fonts/ (binary files + optional fonts.yaml manifest).';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const ctx = args.context ?? 'base';
  const warnings: string[] = [];
  const faces = index[ctx].fonts.length ? index[ctx].fonts : index.base.fonts;
  if (faces.length === 0) warnings.push('No font faces discovered');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify({ context: ctx, faces, _warnings: warnings }, null, 2),
    },
  ];
}
