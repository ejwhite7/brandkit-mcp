/**
 * @file defaults.ts
 * @description Default values and constants for BrandKit MCP configuration.
 *
 * This module serves two purposes:
 *   1. Provides the canonical list of config filenames the loader searches for.
 *   2. Exports a fully populated default config object that other modules
 *      can reference when they need fallback values.
 *
 * Note: Zod's `.default()` calls in the schema handle most defaulting at
 * parse time. The DEFAULT_CONFIG here is useful for documentation, tests,
 * and any code path that needs a config before YAML is loaded.
 */

import type { BrandKitConfig } from '../types/config.js';

/**
 * Ordered list of filenames the config loader searches for when no
 * explicit path is provided.
 *
 * The loader stops at the first match, so order expresses preference:
 *   1. `brandkit.config.yaml`  -- recommended canonical name
 *   2. `brandkit.config.yml`   -- common YAML extension variant
 *   3. `.brandkitrc.yaml`      -- rc-file convention
 *   4. `.brandkitrc.yml`       -- rc-file with .yml extension
 */
export const DEFAULT_CONFIG_FILENAMES: readonly string[] = [
  'brandkit.config.yaml',
  'brandkit.config.yml',
  '.brandkitrc.yaml',
  '.brandkitrc.yml',
] as const;

/**
 * A complete BrandKitConfig populated entirely with default values.
 *
 * Useful for:
 *   - Unit tests that need a baseline config without touching the filesystem
 *   - Fallback values when optional config sections are missing
 *   - Documentation of the "zero-config" baseline
 *
 * The `paths` here are relative strings. In production they are resolved
 * to absolute paths by {@link resolveConfigPaths} in `loader.ts`.
 */
export const DEFAULT_CONFIG: BrandKitConfig = {
  name: 'Unnamed Brand',
  description: undefined,
  version: '1.0.0',

  contexts: {
    marketing: {
      enabled: true,
      label: 'Marketing Site',
      description: undefined,
    },
    product: {
      enabled: true,
      label: 'Product App',
      description: undefined,
    },
  },

  paths: {
    brand: './brand',
    shared: './brand/shared',
    marketing: './brand/marketing',
    product: './brand/product',
  },

  preview: {
    port: 3000,
    host: 'localhost',
  },

  server: {
    transport: 'stdio',
    port: 3001,
    host: 'localhost',
  },
};

/**
 * Returns a deep copy of the default config, safe for mutation.
 *
 * Prefer this over directly referencing `DEFAULT_CONFIG` when you
 * intend to modify values (e.g. in test setup).
 *
 * @returns A fresh deep copy of the default BrandKit configuration.
 */
export function getDefaultConfig(): BrandKitConfig {
  return structuredClone(DEFAULT_CONFIG);
}

/**
 * Standard directory names within a brand folder.
 *
 * Parsers use these to auto-discover assets by convention:
 *   brand/
 *     shared/           -- tokens and assets shared across contexts
 *       colors/
 *       typography/
 *       logos/
 *       textures/
 *       components/
 *       guidelines/
 *       fonts/
 *       css/
 *     marketing/        -- marketing-context overrides
 *       colors/
 *       ...
 *     product/          -- product-context overrides
 *       colors/
 *       ...
 */
export const ASSET_DIRECTORY_NAMES = {
  /** Color palette definitions (CSS, YAML, or Markdown) */
  colors: 'colors',
  /** Typography scale definitions */
  typography: 'typography',
  /** Logo files and usage guidelines */
  logos: 'logos',
  /** Background textures and patterns */
  textures: 'textures',
  /** UI component documentation */
  components: 'components',
  /** Prose guidelines (brand voice, accessibility, etc.) */
  guidelines: 'guidelines',
  /** Web font files (.woff2, .otf, .ttf, .woff) */
  fonts: 'fonts',
  /** CSS stylesheets with custom properties */
  css: 'css',
  /** PDF brand documents */
  pdfs: 'pdfs',
} as const;

/** File extensions recognized by each parser category */
export const RECOGNIZED_EXTENSIONS = {
  /** Extensions the color parser can handle */
  colors: ['.css', '.yaml', '.yml', '.md', '.json'] as const,
  /** Extensions the typography parser can handle */
  typography: ['.css', '.yaml', '.yml', '.md', '.json'] as const,
  /** Extensions the logo parser can handle */
  logos: ['.svg', '.png', '.jpg', '.jpeg', '.webp'] as const,
  /** Extensions the texture parser can handle */
  textures: ['.svg', '.png', '.jpg', '.jpeg', '.webp'] as const,
  /** Extensions the font parser can handle */
  fonts: ['.woff2', '.otf', '.ttf', '.woff'] as const,
  /** Extensions the CSS parser can handle */
  css: ['.css'] as const,
  /** Extensions the guideline parser can handle */
  guidelines: ['.md', '.txt'] as const,
  /** Extensions the PDF parser can handle */
  pdfs: ['.pdf'] as const,
  /** Extensions the component parser can handle */
  components: ['.md', '.yaml', '.yml', '.json'] as const,
} as const;

