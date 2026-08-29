/**
 * @file get-css.ts
 * @description MCP tool: get_css
 * Returns raw CSS text from agent/visual/colors_and_type.css and
 * agent/visual/motion/motion.css for the requested context.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';
import { coerceContext } from './_context.js';

export const TOOL_NAME = 'get_css';

export const TOOL_DESCRIPTION =
  'Return raw CSS text from agent/visual/colors_and_type.css and agent/visual/motion/motion.css for the requested context.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

/**
 * Handles the get_css tool call.
 */
export function handler(
  index: DesignSystemIndex,
  args: { context?: BrandContext },
) {
  const warnings: string[] = [];
  const ctx = coerceContext(args.context, warnings);

  const colorsAndType = index.contexts[ctx].colorsAndType?.rawContent ?? '';
  const motion = index.contexts[ctx].motion?.css ?? '';

  if (!colorsAndType) warnings.push('No colors_and_type.css found');
  if (!motion) warnings.push('No motion.css found');

  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        { context: ctx, colors_and_type: colorsAndType, motion, _warnings: warnings },
        null,
        2,
      ),
    },
  ];
}
