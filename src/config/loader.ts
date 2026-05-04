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
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { BrandKitConfigSchema, type BrandKitConfig } from '../types/config.js';
import { DEFAULT_CONFIG_FILENAMES } from './defaults.js';

/**
 * Returns the directories that should be searched (in order) when no
 * explicit config path is provided. Searching multiple locations lets
 * brandkit-mcp work in environments where the spawning process (Claude
 * Desktop, mcp-proxy, npx, etc.) sets a working directory that differs
 * from where the brand assets live.
 *
 * Order:
 *   1. $BRANDKIT_CONFIG (explicit override directory or file)
 *   2. process.cwd()
 *   3. Walk up from the running script's directory looking for a config
 *      (covers the Docker case where WORKDIR contains brandkit.config.yaml
 *      but the runtime cwd is something else like / or /tmp).
 */
function candidateConfigPaths(): string[] {
  const candidates: string[] = [];

  const envOverride = process.env.BRANDKIT_CONFIG;
  if (envOverride) {
    candidates.push(resolve(envOverride));
  }

  const cwd = process.cwd();
  for (const name of DEFAULT_CONFIG_FILENAMES) {
    candidates.push(join(cwd, name));
  }

  // Walk up from the running script (e.g. /app/dist/cli/index.js) up to
  // a few levels, searching each directory for a known config filename.
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    let dir = scriptDir;
    for (let i = 0; i < 5; i++) {
      for (const name of DEFAULT_CONFIG_FILENAMES) {
        candidates.push(join(dir, name));
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // import.meta.url may be unavailable in unusual runtimes; ignore.
  }

  return candidates;
}

/**
 * Like {@link loadConfig} but also returns the absolute path of the
 * config file that was loaded. Useful for callers that need to resolve
 * relative paths in the config against the config's directory rather
 * than the current working directory.
 */
export function loadConfigWithPath(configPath?: string): { config: BrandKitConfig; filePath: string } {
  const filePath = resolveConfigFilePath(configPath);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;
  const result = BrandKitConfigSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid config in ${filePath}:\n${issues}`);
  }

  return { config: result.data, filePath };
}

function resolveConfigFilePath(configPath?: string): string {
  if (configPath) {
    const filePath = resolve(configPath);
    if (!existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`);
    }
    return filePath;
  }

  for (const candidate of candidateConfigPaths()) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `No config file found. Searched for ${DEFAULT_CONFIG_FILENAMES.join(', ')} ` +
    `in $BRANDKIT_CONFIG, ${process.cwd()}, and the install directory.\n` +
    'Run `brandkit-mcp init` to create one, or set BRANDKIT_CONFIG to point at one.',
  );
}

/**
 * Finds and loads brandkit.config.yaml from the given path or by
 * searching the current working directory for known config filenames.
 *
 * @param configPath - Optional explicit path to a config file.
 * @returns A validated (but not path-resolved) BrandKitConfig.
 * @throws {Error} If no config file is found or validation fails.
 */
export function loadConfig(configPath?: string): BrandKitConfig {
  return loadConfigWithPath(configPath).config;
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

