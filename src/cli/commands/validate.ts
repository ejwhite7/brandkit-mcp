/**
 * @file commands/validate.ts
 * @description Implementation of the `brandkit-mcp validate` command.
 * Validates the configuration and scans the brand directory for issues.
 */

import { existsSync } from 'fs';
import { dirname } from 'path';
import { loadConfigWithPath, resolveConfigPaths } from '../../config/loader.js';
import type { BrandKitConfig } from '../../types/config.js';
import { buildDesignSystemIndex } from '../../indexer/index.js';

/**
 * Handles the `brandkit-mcp validate [config-path]` command.
 * @param configPath - Optional path to brandkit.config.yaml
 */
export async function validateCommand(configPath?: string): Promise<void> {
  console.log('Validating BrandKit MCP configuration...\n');

  let config: BrandKitConfig;
  try {
    const { config: rawConfig, filePath } = loadConfigWithPath(configPath);
    config = resolveConfigPaths(rawConfig, dirname(filePath));
    console.log('[OK] Configuration loaded successfully');
    console.log(`     Brand name: ${config.brand.name}`);
  } catch (err) {
    console.error('[ERROR] Failed to load configuration:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Check directory structure
  const dirs = [
    { path: config.brand.root, label: 'Brand root directory' },
  ];

  let hasErrors = false;
  for (const dir of dirs) {
    if (existsSync(dir.path)) {
      console.log(`[OK] ${dir.label} found: ${dir.path}`);
    } else {
      console.log(`[WARN] ${dir.label} not found: ${dir.path}`);
    }
  }

  // Build index and report
  try {
    console.log('\nScanning design system files...\n');
    const index = await buildDesignSystemIndex(config);

    console.log('Asset Inventory (base context):');
    console.log(`  Tokens:      ${index.contexts.base.tokens.length}`);
    console.log(`  Components:  ${index.contexts.base.components.length}`);
    console.log(`  Fonts:       ${index.contexts.base.fonts.length}`);
    console.log(`  Assets:      ${index.contexts.base.assets.length}`);
    console.log(`  Motion:      ${index.contexts.base.motion != null ? 'yes' : 'no'}`);

    console.log('\nVerbal Layer:');
    console.log(`  Positioning: ${index.verbal.positioning != null ? 'yes' : 'no'}`);
    console.log(`  Audience:    ${index.verbal.audience != null ? 'yes' : 'no'}`);
    console.log(`  Messaging:   ${index.verbal.messaging != null ? 'yes' : 'no'}`);
    console.log(`  Differentiation: ${index.verbal.differentiation != null ? 'yes' : 'no'}`);
    console.log(`  Concepts:    ${index.verbal.concepts != null ? 'yes' : 'no'}`);
    console.log(`  Voice:       ${index.verbal.voice != null ? 'yes' : 'no'}`);
    console.log(`  Magic Trick: ${index.magicTrick != null ? 'yes' : 'no'}`);

    if (index.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of index.warnings) {
        console.log(`  [WARN] ${w}`);
      }
    }

    const totalAssets = index.contexts.base.tokens.length + index.contexts.base.components.length + index.contexts.base.assets.length;
    if (totalAssets === 0) {
      console.log('\n[WARN] No design system files found. Add files to the brand root directory.');
      hasErrors = true;
    } else {
      console.log('\n[OK] Validation passed.');
    }
  } catch (err) {
    console.error('\n[ERROR] Failed to build design system index:', err instanceof Error ? err.message : err);
    hasErrors = true;
  }

  process.exit(hasErrors ? 1 : 0);
}
