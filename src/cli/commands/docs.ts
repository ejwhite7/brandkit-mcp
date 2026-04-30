/**
 * @file commands/docs.ts
 * @description Implementation of the `brandkit-mcp docs` command.
 * Generates project documentation files: CLAUDE.md, AGENTS.md, SKILLS.md, and DESIGN.md.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, resolveConfigPaths } from '../../config/loader.js';
import { buildDesignSystemIndex } from '../../indexer/index.js';

const DELIMITER_START = '<!-- BRANDKIT:AUTO-GENERATED:START -->';
const DELIMITER_END = '<!-- BRANDKIT:AUTO-GENERATED:END -->';

/**
 * Handles the `brandkit-mcp docs` command.
 * Generates CLAUDE.md, AGENTS.md, SKILLS.md, and DESIGN.md from the design system.
 */
export async function docsCommand(options: { config?: string; output?: string }): Promise<void> {
  console.log('Generating project documentation...\n');

  const rawConfig = loadConfig(options.config);
  const config = resolveConfigPaths(rawConfig, process.cwd());
  const index = await buildDesignSystemIndex(config);
  const inv = index.resolved.all.assetInventory;
  const outputDir = options.output ?? process.cwd();

  // Generate CLAUDE.md
  const claudeContent = `# ${config.name} Design System

${DELIMITER_START}

## Brand Overview

- **Name**: ${config.name}
- **Description**: ${config.description ?? 'N/A'}
- **Contexts**: Marketing (${config.contexts.marketing.label}), Product (${config.contexts.product.label})

## Asset Inventory

| Category | Count |
|---|---|
| Colors | ${inv.colors} |
| Typography | ${inv.typography} |
| Logo Variants | ${inv.logos} |
| Components | ${inv.components} |
| Guidelines | ${inv.guidelines} |
| Textures | ${inv.textures} |
| CSS Files | ${inv.cssFiles} |
| Fonts | ${inv.fonts} |

## Available MCP Tools

Use these tools to query the design system:
- \`get_brand_overview\` -- High-level overview
- \`get_colors\` -- Color palette (supports css/scss/tailwind/json formats)
- \`get_typography\` -- Typography specs
- \`get_logos\` -- Logo variants and usage guidelines
- \`get_components\` -- Component specifications
- \`get_guidelines\` -- Brand guidelines
- \`get_tokens\` -- Design tokens in any format
- \`get_textures\` -- Texture assets
- \`get_css\` -- Raw CSS files
- \`search_brand\` -- Full-text search
- \`get_context_diff\` -- Compare marketing vs product
- \`validate_usage\` -- Validate brand compliance

${DELIMITER_END}
`;
  writeFileSync(join(outputDir, 'CLAUDE.md'), claudeContent);
  console.log('[OK] Generated CLAUDE.md');

  // Generate AGENTS.md
  const agentsContent = `# ${config.name} -- Agent Guidelines

${DELIMITER_START}

## Design System Rules

When generating code or content for ${config.name}:

1. Always use the brand colors from the design system (use \`get_colors\` tool)
2. Use the specified typography (use \`get_typography\` tool)
3. Follow the brand voice guidelines (use \`get_guidelines\` with section "brand-voice")
4. Use the correct context: "marketing" for website, "product" for app
5. Validate any color/font choices with \`validate_usage\`

## Context Rules

- **Marketing context**: Use marketing-specific colors, typography, and components
- **Product context**: Use product-specific colors, typography, and components
- **Shared assets**: Available in both contexts as defaults

${DELIMITER_END}
`;
  writeFileSync(join(outputDir, 'AGENTS.md'), agentsContent);
  console.log('[OK] Generated AGENTS.md');

  // Generate SKILLS.md
  const skillsContent = `# ${config.name} -- Skills Reference

${DELIMITER_START}

## Design System Query Skills

### Get Brand Colors
\`\`\`
Tool: get_colors
Args: { "context": "marketing", "format": "css" }
\`\`\`

### Get Typography
\`\`\`
Tool: get_typography
Args: { "context": "product", "format": "json" }
\`\`\`

### Search Design System
\`\`\`
Tool: search_brand
Args: { "query": "button primary", "context": "product" }
\`\`\`

### Export Design Tokens
\`\`\`
Tool: get_tokens
Args: { "format": "tailwind", "category": "colors" }
\`\`\`

### Compare Contexts
\`\`\`
Tool: get_context_diff
Args: { "category": "colors" }
\`\`\`

${DELIMITER_END}
`;
  writeFileSync(join(outputDir, 'SKILLS.md'), skillsContent);
  console.log('[OK] Generated SKILLS.md');

  // Generate DESIGN.md
  const colorSummary = index.resolved.all.colors.slice(0, 10)
    .map((c) => `- **${c.name}**: \`${c.value}\` (${c.token})`)
    .join('\n');

  const typoSummary = index.resolved.all.typography.slice(0, 10)
    .map((t) => `- **${t.name}**: ${t.fontSize ?? ''} ${t.fontFamily ?? ''} ${t.fontWeight ?? ''}`.trim())
    .join('\n');

  const componentSummary = index.resolved.all.components
    .map((c) => `- **${c.name}** (${c.category}): ${c.description ?? 'No description'}`)
    .join('\n');

  const designContent = `# ${config.name} -- Design System Reference

${DELIMITER_START}

## Colors

${colorSummary || 'No colors defined.'}

## Typography

${typoSummary || 'No typography defined.'}

## Components

${componentSummary || 'No components defined.'}

## Logo Variants

${index.resolved.all.logos.variants.map((v) => `- **${v.name}** (${v.format})`).join('\n') || 'No logo variants.'}

${DELIMITER_END}
`;
  writeFileSync(join(outputDir, 'DESIGN.md'), designContent);
  console.log('[OK] Generated DESIGN.md');

  console.log('\nAll documentation files generated successfully.');
}

