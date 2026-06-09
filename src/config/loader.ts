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
import { BrandKitConfigSchema, BrandkitV1ConfigError, type BrandKitConfig } from '../types/config.js';
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
  // a few levels. At each level, probe both the directory itself and a
  // small set of well-known bundled-demo subdirectories. This lets the
  // server start out-of-the-box when:
  //   - run from the source repo (Glama auto-build, npm-published package):
  //     templates/starter/ and examples/acme-corp/ ship a working brand
  //   - run from our Docker image: brandkit.config.yaml lives at /app
  //   - run via `npx brandkit-mcp` with no local config: falls back to
  //     the bundled starter template
  const BUNDLED_SUBDIRS = ['', 'templates/starter', 'examples/acme-corp'];
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    let dir = scriptDir;
    for (let i = 0; i < 6; i++) {
      for (const sub of BUNDLED_SUBDIRS) {
        const base = sub ? join(dir, sub) : dir;
        for (const name of DEFAULT_CONFIG_FILENAMES) {
          candidates.push(join(base, name));
        }
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
 * Detects if a parsed YAML object contains v1 config markers.
 *
 * V1 configs have:
 *   - A top-level `name` field (not nested under `brand`)
 *   - A top-level `paths` field (v2 nests paths differently)
 *   - A `contexts` field with `marketing` or `product` as objects (v2 has `contexts` as an array)
 *
 * @param parsed - The parsed YAML object
 * @returns true if v1 markers are detected
 */
function isV1Config(parsed: Record<string, unknown>): boolean {
  // V1 had top-level `name` field
  if (typeof parsed.name === 'string') {
    return true;
  }

  // V1 had top-level `paths` field
  if (parsed.paths && typeof parsed.paths === 'object') {
    return true;
  }

  // V1 had `contexts` as an object with `marketing`/`product` keys
  if (
    parsed.contexts &&
    typeof parsed.contexts === 'object' &&
    !Array.isArray(parsed.contexts) &&
    ('marketing' in parsed.contexts || 'product' in parsed.contexts)
  ) {
    return true;
  }

  return false;
}

/**
 * Parses YAML text and validates it as a v2 BrandKit config.
 *
 * Detects v1 configs and throws BrandkitV1ConfigError with migration guidance.
 * Otherwise validates against the v2 schema and returns the parsed config.
 *
 * @param yamlText - The YAML content to parse
 * @param sourcePath - The source file path (for error messages)
 * @returns A validated BrandKitConfig
 * @throws {BrandkitV1ConfigError} If a v1 config is detected
 * @throws {Error} If the config is invalid or parsing fails
 */
export function loadConfigFromString(yamlText: string, sourcePath: string): BrandKitConfig {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText);
  } catch (err) {
    throw new Error(`Failed to parse YAML at ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Config at ${sourcePath} must be an object`);
  }

  const parsedObj = parsed as Record<string, unknown>;

  // Detect v1 config markers
  if (isV1Config(parsedObj)) {
    throw new BrandkitV1ConfigError(
      `v1 config detected at ${sourcePath}. ` +
        'Migrate to v2: see docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md',
    );
  }

  // CLAUDE.md contract: a config without `version: 2` throws
  // BrandkitV1ConfigError with migration guidance, even when no positive
  // v1 marker is present.
  if (parsedObj.version !== 2) {
    throw new BrandkitV1ConfigError(
      `Config at ${sourcePath} is missing \`version: 2\` (found: ${JSON.stringify(parsedObj.version)}). ` +
        'BrandKit v2 requires `version: 2`. ' +
        'Migrate to v2: see docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md',
    );
  }

  // Validate against v2 schema
  const result = BrandKitConfigSchema.safeParse(parsedObj);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid config in ${sourcePath}:\n${issues}`);
  }

  return result.data;
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
  const config = loadConfigFromString(raw, filePath);

  return { config, filePath };
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
    brand: {
      ...config.brand,
      root: resolve(basePath, config.brand.root),
    },
  };
}
