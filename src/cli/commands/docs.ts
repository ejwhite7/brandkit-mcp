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
import { join, dirname } from 'path';
import { loadConfigWithPath, resolveConfigPaths } from '../../config/loader.js';
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
| Tokens | ${index.base.tokens.length} |
| Components | ${index.base.components.length} |
| Fonts | ${index.base.fonts.length} |
| Assets | ${index.base.assets.length} |
| Motion | ${index.base.motion != null ? 'yes' : 'no'} |

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

  // Generate DESIGN.md
  const tokenSummary = index.base.tokens.slice(0, 10)
    .map((t) => `- **${t.name}**: \`${t.value}\``)
    .join('\n');

  const componentSummary = index.base.components
    .map((c) => `- **${c.name}**: ${c.description ?? 'No description'}`)
    .join('\n');

  const assetSummary = index.base.assets.slice(0, 10)
    .map((a) => `- **${a.file}** (${a.format})`)
    .join('\n');

  const designBlock = `# ${brandName} -- Design System Reference

## Tokens (base context)

${tokenSummary || 'No tokens defined.'}

## Components (base context)

${componentSummary || 'No components defined.'}

## Assets (base context)

${assetSummary || 'No assets defined.'}`;

  updateFileWithDelimiters(join(outputDir, 'DESIGN.md'), designBlock);
  console.log('[OK] Generated DESIGN.md');

  console.log('\nAll documentation files generated successfully.');
}
