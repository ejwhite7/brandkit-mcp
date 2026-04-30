/**
 * @file loader.ts
 * @description Config loader for brandkit.config.yaml.
 *
 * Responsible for:
 *   1. Locating the config file (explicit path or auto-discovery)
 *   2. Parsing the YAML content
 *   3. Validating against the Zod schema
 *   4. Resolving relative directory paths to absolute paths
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import yaml from 'js-yaml';
import { BrandKitConfigSchema, type BrandKitConfig } from '../types/config.js';
import { DEFAULT_CONFIG_FILENAMES } from './defaults.js';

/**
 * Finds and loads brandkit.config.yaml from the given path or by
 * searching the current working directory for known config filenames.
 *
 * @param configPath - Optional explicit path to a config file.
 * @returns A validated (but not path-resolved) BrandKitConfig.
 * @throws {Error} If no config file is found or validation fails.
 */
export function loadConfig(configPath?: string): BrandKitConfig {
  let filePath: string | undefined;

  if (configPath) {
    filePath = resolve(configPath);
    if (!existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`);
    }
  } else {
    const cwd = process.cwd();
    for (const name of DEFAULT_CONFIG_FILENAMES) {
      const candidate = join(cwd, name);
      if (existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }
  }

  if (!filePath) {
    throw new Error(
      `No config file found. Searched for: ${DEFAULT_CONFIG_FILENAMES.join(', ')}\n` +
      'Run `brandkit-mcp init` to create one.',
    );
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;
  const result = BrandKitConfigSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid config in ${filePath}:\n${issues}`);
  }

  return result.data;
}

/**
 * Resolves relative directory paths in the config to absolute paths.
 *
 * @param config - A validated BrandKitConfig with potentially relative paths.
 * @param basePath - The directory to resolve relative paths against (usually cwd).
 * @returns A new config object with absolute paths.
 */
export function resolveConfigPaths(config: BrandKitConfig, basePath: string): BrandKitConfig {
  return {
    ...config,
    paths: {
      brand: resolve(basePath, config.paths.brand),
      shared: resolve(basePath, config.paths.shared),
      marketing: resolve(basePath, config.paths.marketing),
      product: resolve(basePath, config.paths.product),
    },
  };
}

