import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';
import { coerceContext } from './_context.js';

export const TOOL_NAME = 'get_motion';

export const TOOL_DESCRIPTION =
  'Return the motion system: parsed motion.json tokens + motion.css text.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const warnings: string[] = [];
  const ctx = coerceContext(args.context, warnings);
  const motion = index.contexts[ctx].motion;
  if (!motion) warnings.push('No motion system found at agent/visual/motion/');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          context: ctx,
          tokens: motion?.tokens ?? null,
          css: motion?.css ?? '',
          source: motion?.source,
          _warnings: warnings,
        },
        null,
        2,
      ),
    },
  ];
}
