import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';

export const TOOL_NAME = 'get_colors_and_type';

export const TOOL_DESCRIPTION =
  'Return colors and typography as CSS custom properties from agent/visual/colors_and_type.css (with optional artifact override).';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const ctx = args.context ?? 'base';
  const warnings: string[] = [];
  const file = index[ctx].colorsAndType ?? index.base.colorsAndType;
  if (!file) warnings.push('No colors_and_type.css found');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          context: ctx,
          customProperties: file?.customProperties ?? {},
          source: file?.filePath,
          _warnings: warnings,
        },
        null,
        2,
      ),
    },
  ];
}
