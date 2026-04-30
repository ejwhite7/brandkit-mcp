/**
 * @file commands/docs.ts
 * @description Implementation of the `brandkit-mcp docs` command.
 * Generates project documentation files: CLAUDE.md, AGENTS.md, SKILLS.md, and DESIGN.md.
 *
 * User content outside the branded delimiter block is preserved on
 * subsequent runs. Only the region between the start and end delimiters
 * is replaced; if no delimiters exist in an existing file the generated
 * block is appended so nothing is lost.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, resolveConfigPaths } from '../../config/loader.js';
import { buildDesignSystemIndex } from '../../indexer/index.js';

const DELIMITER_START = '<!-- brandkit-mcp:start -->';
const DELIMITER_END = '<!-- brandkit-mcp:end -->';

/**
 * Write a generated block into a file while preserving any user content
 * that lives outside the delimiter markers.
 *
 * - If the file does not exist: create it with the delimited block.
 * - If the file exists and contains delimiters: replace only the
 *   delimited region.
 * - If the file exists but has no delimiters: append the block so
 *   existing user content is never overwritten.
 */
function updateFileWithDelimiters(filePath: string, generatedBlock: string): void {
  const wrappedBlock = `${DELIMITER_START}\n${generatedBlock}\n${DELIMITER_END}`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, wrappedBlock + '\n', 'utf-8');
    return;
  }

  const existing = readFileSync(filePath, 'utf-8');
  const startIdx = existing.indexOf(DELIMITER_START);
  const endIdx = existing.indexOf(DELIMITER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace the existing delimited block only
    const updated =
      existing.slice(0, startIdx) +
      wrappedBlock +
      existing.slice(endIdx + DELIMITER_END.length);
    writeFileSync(filePath, updated, 'utf-8');
  } else {
    // No delimiters found -- append to preserve existing content
    writeFileSync(filePath, existing.trimEnd() + '\n\n' + wrappedBlock + '\n', 'utf-8');
  }
}

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
  const claudeBlock = `# ${config.name} Design System

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
- \`validate_usage\` -- Validate brand compliance`;

  updateFileWithDelimiters(join(outputDir, 'CLAUDE.md'), claudeBlock);
  console.log('[OK] Generated CLAUDE.md');

  // Generate AGENTS.md
  const agentsBlock = `# ${config.name} -- Agent Guidelines

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
- **Shared assets**: Available in both contexts as defaults`;

  updateFileWithDelimiters(join(outputDir, 'AGENTS.md'), agentsBlock);
  console.log('[OK] Generated AGENTS.md');

  // Generate SKILLS.md
  const skillsBlock = `# ${config.name} -- Skills Reference

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
\`\`\``;

  updateFileWithDelimiters(join(outputDir, 'SKILLS.md'), skillsBlock);
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

  const designBlock = `# ${config.name} -- Design System Reference

## Colors

${colorSummary || 'No colors defined.'}

## Typography

${typoSummary || 'No typography defined.'}

## Components

${componentSummary || 'No components defined.'}

## Logo Variants

${index.resolved.all.logos.variants.map((v) => `- **${v.name}** (${v.format})`).join('\n') || 'No logo variants.'}`;

  updateFileWithDelimiters(join(outputDir, 'DESIGN.md'), designBlock);
  console.log('[OK] Generated DESIGN.md');

  console.log('\nAll documentation files generated successfully.');
}
