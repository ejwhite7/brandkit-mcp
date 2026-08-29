/**
 * @file commands/docs.ts
 * @description Implementation of the `brandkit-mcp docs` command.
 * Generates project documentation files: CLAUDE.md, AGENTS.md, SKILLS.md,
 * DESIGN.md, and PRODUCT.md.
 *
 * User content outside the branded delimiter block is preserved on
 * subsequent runs. Only the region between the start and end delimiters
 * is replaced; if no delimiters exist in an existing file the generated
 * block is appended so nothing is lost.
 */

import { join, dirname } from 'path';
import { loadConfigWithPath, resolveConfigPaths } from '../../config/loader.js';
import { buildDesignSystemIndex } from '../../indexer/index.js';
import { updateFileWithDelimiters, writeBrandDocs } from '../../brand-docs/write.js';
import { generateBrandDocs } from '../../brand-docs/generate.js';
import { fillBriefPlaceholders } from '../../brand-docs/brief.js';

/**
 * Handles the `brandkit-mcp docs` command.
 * Generates CLAUDE.md, AGENTS.md, SKILLS.md, DESIGN.md, and PRODUCT.md from the design system.
 */
export async function docsCommand(options: { config?: string; output?: string }): Promise<void> {
  console.log('Generating project documentation...\n');

  // Resolve relative paths against the config file's own directory (same
  // portability fix as startServer in src/index.ts).
  const { config: rawConfig, filePath } = loadConfigWithPath(options.config);
  const config = resolveConfigPaths(rawConfig, dirname(filePath));
  const index = await buildDesignSystemIndex(config);
  const outputDir = options.output ?? process.cwd();

  const brandName = config.brand.name;
  const brandDescription = config.brand.description ?? 'N/A';

  // Generate CLAUDE.md
  const claudeBlock = `# ${brandName} Design System

## Brand Overview

- **Name**: ${brandName}
- **Description**: ${brandDescription}
- **Brand Root**: ${config.brand.root}

## Asset Inventory (base context)

| Category | Count |
|---|---|
| Tokens | ${index.contexts.base.tokens.length} |
| Components | ${index.contexts.base.components.length} |
| Fonts | ${index.contexts.base.fonts.length} |
| Assets | ${index.contexts.base.assets.length} |
| Motion | ${index.contexts.base.motion != null ? 'yes' : 'no'} |

## Available MCP Tools (v2 surface)

Use these tools to query the design system:
- \`get_brand_overview\` -- High-level overview + taste primer
- \`get_magic_trick\` -- Verbatim magic_trick.md
- \`get_positioning\` -- Positioning document
- \`get_audience\` -- Audience YAML, parsed
- \`get_messaging\` -- Messaging document
- \`get_differentiation\` -- Differentiation document
- \`get_concepts\` -- Creative concepts/directions
- \`get_voice\` -- Voice document
- \`get_colors_and_type\` -- Colors + typography custom properties
- \`get_assets\` -- Logos + brand assets
- \`get_fonts\` -- Font faces
- \`get_components\` -- UI primitives
- \`get_tokens\` -- Token specimens
- \`get_motion\` -- Motion system
- \`get_css\` -- colors_and_type.css + motion.css text
- \`search_brand\` -- Full-text search
- \`get_context_diff\` -- Diff base vs web vs product
- \`validate_usage\` -- Validate brand compliance`;

  updateFileWithDelimiters(join(outputDir, 'CLAUDE.md'), claudeBlock);
  console.log('[OK] Generated CLAUDE.md');

  // Generate AGENTS.md
  const agentsBlock = `# ${brandName} -- Agent Guidelines

## Design System Rules

When generating code or content for ${brandName}:

1. Always load the brand overview first with \`get_brand_overview\`
2. Use colors and typography via \`get_colors_and_type\`
3. Follow the brand voice guidelines via \`get_voice\`
4. Use the correct context: "base" (default), "web" for website, "product" for app
5. Validate any design choices with \`validate_usage\`

## Context Rules

- **base**: Default shared assets (agent/visual/)
- **web**: Web-specific overrides (agent/visual/artifacts/web/)
- **product**: Product/app-specific overrides (agent/visual/artifacts/product/)`;

  updateFileWithDelimiters(join(outputDir, 'AGENTS.md'), agentsBlock);
  console.log('[OK] Generated AGENTS.md');

  // Generate SKILLS.md
  const skillsBlock = `# ${brandName} -- Skills Reference

## Design System Query Skills

### Get Brand Colors and Typography
\`\`\`
Tool: get_colors_and_type
Args: { "context": "base" }
\`\`\`

### Get Voice Guidelines
\`\`\`
Tool: get_voice
\`\`\`

### Search Design System
\`\`\`
Tool: search_brand
Args: { "query": "button primary", "context": "base" }
\`\`\`

### Export Design Tokens
\`\`\`
Tool: get_tokens
Args: { "context": "base" }
\`\`\`

### Compare Contexts
\`\`\`
Tool: get_context_diff
\`\`\``;

  updateFileWithDelimiters(join(outputDir, 'SKILLS.md'), skillsBlock);
  console.log('[OK] Generated SKILLS.md');

  // DESIGN.md + PRODUCT.md via the shared generator (single source of truth).
  // Empty brief fields render as a placeholder pointing at sync_brand_docs.
  const brief = fillBriefPlaceholders(config.brief);
  writeBrandDocs(outputDir, generateBrandDocs(index, brief));
  console.log('[OK] Generated DESIGN.md');
  console.log('[OK] Generated PRODUCT.md');

  console.log('\nAll documentation files generated successfully.');
}
