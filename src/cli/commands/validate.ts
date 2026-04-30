/**
 * @file commands/validate.ts
 * @description Implementation of the `brandkit-mcp validate` command.
 * Validates the configuration and scans the brand directory for issues.
 */

import { existsSync } from 'fs';
import { loadConfig, resolveConfigPaths } from '../../config/loader.js';
import { buildDesignSystemIndex } from '../../indexer/index.js';

/**
 * Handles the `brandkit-mcp validate [config-path]` command.
 * @param configPath - Optional path to brandkit.config.yaml
 */
export async function validateCommand(configPath?: string): Promise<void> {
  console.log('Validating BrandKit MCP configuration...\n');

  let config;
  try {
    const rawConfig = loadConfig(configPath);
    config = resolveConfigPaths(rawConfig, process.cwd());
    console.log('[OK] Configuration loaded successfully');
    console.log(`     Brand name: ${config.name}`);
  } catch (err) {
    console.error('[ERROR] Failed to load configuration:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Check directory structure
  const dirs = [
    { path: config.paths.brand, label: 'Brand directory' },
    { path: config.paths.shared, label: 'Shared directory' },
    { path: config.paths.marketing, label: 'Marketing directory' },
    { path: config.paths.product, label: 'Product directory' },
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
    const inv = index.resolved.all.assetInventory;

    console.log('Asset Inventory:');
    console.log(`  Colors:      ${inv.colors}`);
    console.log(`  Typography:  ${inv.typography}`);
    console.log(`  Logos:       ${inv.logos}`);
    console.log(`  Components:  ${inv.components}`);
    console.log(`  Guidelines:  ${inv.guidelines}`);
    console.log(`  Textures:    ${inv.textures}`);
    console.log(`  CSS Files:   ${inv.cssFiles}`);
    console.log(`  Fonts:       ${inv.fonts}`);
    console.log(`  PDFs:        ${inv.pdfs}`);
    console.log(`  Total:       ${inv.totalFiles}`);

    console.log('\nContexts:');
    console.log(`  Shared:    ${index.shared.colors.length} colors, ${index.shared.typography.length} typography, ${index.shared.components.length} components`);
    console.log(`  Marketing: ${index.marketing.colors.length} colors, ${index.marketing.typography.length} typography, ${index.marketing.components.length} components`);
    console.log(`  Product:   ${index.product.colors.length} colors, ${index.product.typography.length} typography, ${index.product.components.length} components`);

    if (inv.totalFiles === 0) {
      console.log('\n[WARN] No design system files found. Add files to the brand/ directory.');
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

