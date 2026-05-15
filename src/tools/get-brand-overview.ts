/**
 * @file get-brand-overview.ts
 * @description MCP tool: get_brand_overview
 * Returns a high-level overview of the design system including brand name,
 * contexts, asset inventory, available 18 tools, and taste primer.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_brand_overview';

export const TOOL_DESCRIPTION =
  'High-level overview of the brand atomic system: brand name, magic_trick presence, inventory counts, contexts, and the full v2 tool list.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

const TOOLS: ReadonlyArray<readonly [string, string]> = [
  ['get_brand_overview', 'High-level overview + taste primer'],
  ['get_magic_trick', 'Verbatim magic_trick.md'],
  ['get_positioning', 'Positioning document'],
  ['get_audience', 'Audience YAML, parsed'],
  ['get_messaging', 'Messaging document'],
  ['get_differentiation', 'Differentiation document'],
  ['get_concepts', 'Creative concepts/directions'],
  ['get_voice', 'Voice document'],
  ['get_colors_and_type', 'Colors + typography custom properties'],
  ['get_assets', 'Logos + brand assets (replaces v1 get_logos + get_textures)'],
  ['get_fonts', 'Font faces from fonts/'],
  ['get_components', 'UI primitives'],
  ['get_tokens', 'Token specimens'],
  ['get_motion', 'Motion system (json + css)'],
  ['get_css', 'colors_and_type.css + motion.css text'],
  ['search_brand', 'Full-text search'],
  ['validate_usage', 'Validate brand compliance'],
  ['get_context_diff', 'Diff base vs web vs product'],
];

/**
 * Handles the get_brand_overview tool call.
 * @param index - The design system index
 * @returns MCP CallToolResult content
 */
export function handler(index: DesignSystemIndex) {
  const payload = {
    name: index.brandName,
    description: index.brandDescription,
    lastIndexed: index.lastIndexed.toISOString(),
    contexts: ['base', 'web', 'product'] as const,
    inventory: {
      tokens: index.base.tokens.length,
      components: index.base.components.length,
      fonts: index.base.fonts.length,
      assets: index.base.assets.length,
      motion: index.base.motion != null,
      verbal: {
        positioning: index.verbal.positioning != null,
        audience: index.verbal.audience != null,
        messaging: index.verbal.messaging != null,
        differentiation: index.verbal.differentiation != null,
        concepts: index.verbal.concepts != null,
        voice: index.verbal.voice != null,
      },
      magicTrick: index.magicTrick != null,
    },
    availableTools: TOOLS.map(([name, description]) => ({ name, description })),
    _warnings: index.warnings,
  };

  return [
    {
      type: 'text' as const,
      text: JSON.stringify(attachTastePrimer(payload, index), null, 2),
    },
  ];
}

