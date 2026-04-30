/**
 * @file get-brand-overview.ts
 * @description MCP tool: get_brand_overview
 * Returns a high-level overview of the design system including brand name,
 * active contexts, asset inventory counts, and available tools.
 */

import type { DesignSystemIndex } from '../indexer/types.js';

export const TOOL_NAME = 'get_brand_overview';

export const TOOL_DESCRIPTION =
  'Get a high-level overview of the design system: brand name, active contexts, asset inventory counts, and available design system sections.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

/**
 * Handles the get_brand_overview tool call.
 * @param index - The design system index
 * @returns MCP CallToolResult content
 */
export function handler(index: DesignSystemIndex) {
  const inv = index.resolved.all.assetInventory;

  const overview = {
    name: index.resolved.all.name,
    description: index.resolved.all.description,
    lastIndexed: index.lastIndexed.toISOString(),
    contexts: {
      shared: { colors: index.shared.colors.length, typography: index.shared.typography.length, components: index.shared.components.length },
      marketing: { colors: index.marketing.colors.length, typography: index.marketing.typography.length, components: index.marketing.components.length },
      product: { colors: index.product.colors.length, typography: index.product.typography.length, components: index.product.components.length },
    },
    assetInventory: inv,
    availableTools: [
      { name: 'get_brand_overview', description: 'High-level design system overview' },
      { name: 'get_colors', description: 'Color palette with filtering and format options' },
      { name: 'get_typography', description: 'Typography specifications' },
      { name: 'get_logos', description: 'Logo variants and usage guidelines' },
      { name: 'get_components', description: 'Component specifications' },
      { name: 'get_guidelines', description: 'Brand guidelines and documentation' },
      { name: 'get_tokens', description: 'Design tokens in CSS/SCSS/Tailwind/W3C/JSON' },
      { name: 'get_textures', description: 'Texture and pattern assets' },
      { name: 'get_css', description: 'Raw CSS files and custom properties' },
      { name: 'search_brand', description: 'Full-text search across design system' },
      { name: 'get_context_diff', description: 'Compare marketing vs product contexts' },
      { name: 'validate_usage', description: 'Validate brand compliance' },
    ],
  };

  return [{ type: 'text' as const, text: JSON.stringify(overview, null, 2) }];
}

