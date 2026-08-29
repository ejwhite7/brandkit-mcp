import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats,
} from 'fs';
import { randomUUID } from 'crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { atomicWriteFile, type RegularFileIdentity } from '../../brand-docs/write.js';

export class InitDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitDestinationError';
  }
}

interface InitPreflight {
  target: Stats | undefined;
  brand: Stats | undefined;
  config: Stats | undefined;
}

interface TemplatePlan {
  directories: string[];
  files: Array<{ relativePath: string; identity: RegularFileIdentity; mode: number }>;
}

interface InitOperations {
  rename: typeof renameSync;
}

const defaultInitOperations: InitOperations = { rename: renameSync };

function findTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../templates/starter/brand_atomic_system'),
    join(here, '../../../templates/starter/brand_atomic_system'),
    join(here, '../../../../templates/starter/brand_atomic_system'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `Could not locate bundled starter template (searched: ${candidates.join(', ')})`,
  );
}

function inspectOptional(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new InitDestinationError(
      `Could not inspect initialization destination ${basename(path)}: ${(err as Error).message}`,
    );
  }
}

function sameFile(left: Pick<Stats, 'dev' | 'ino'>, right: Pick<Stats, 'dev' | 'ino'>): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function preflightDestinations(targetDir: string, force: boolean): InitPreflight {
  const target = inspectOptional(targetDir);
  if (target?.isSymbolicLink() || (target && !target.isDirectory())) {
    throw new InitDestinationError('Refusing to initialize into a symbolic-link or non-directory target');
  }

  const brandPath = join(targetDir, 'brand_atomic_system');
  const configPath = join(targetDir, 'brandkit.config.yaml');
  const brand = target ? inspectOptional(brandPath) : undefined;
  const config = target ? inspectOptional(configPath) : undefined;

  if (brand?.isSymbolicLink() || (brand && !brand.isDirectory())) {
    throw new InitDestinationError(
      'Refusing to replace a symbolic-link or non-directory brand_atomic_system destination',
    );
  }
  if (config?.isSymbolicLink()) {
    throw new InitDestinationError('Refusing to replace symbolic-link brandkit.config.yaml');
  }
  if (config && !config.isFile()) {
    throw new InitDestinationError('Refusing to replace non-regular brandkit.config.yaml');
  }
  if (config && config.nlink > 1) {
    throw new InitDestinationError('Refusing to replace hard-linked brandkit.config.yaml');
  }

  if (!force && (brand || config)) {
    const conflicts = [
      brand ? 'brand_atomic_system/' : undefined,
      config ? 'brandkit.config.yaml' : undefined,
    ].filter(Boolean);
    throw new InitDestinationError(
      `${conflicts.join(' and ')} already ${conflicts.length === 1 ? 'exists' : 'exist'}. Use --force to replace safe destinations.`,
    );
  }
  return { target, brand, config };
}

function assertEntryUnchanged(path: string, expected: Stats | undefined, kind: string): void {
  const current = inspectOptional(path);
  if (!expected) {
    if (current) throw new InitDestinationError(`${kind} appeared after initialization preflight`);
    return;
  }
  if (!current || !sameFile(current, expected)) {
    throw new InitDestinationError(`${kind} changed after initialization preflight`);
  }
}

function buildTemplatePlan(root: string): TemplatePlan {
  const templateRoot = lstatSync(root);
  if (templateRoot.isSymbolicLink() || !templateRoot.isDirectory()) {
    throw new InitDestinationError('Bundled starter template root is not a regular directory');
  }
  const directories: string[] = [];
  const files: TemplatePlan['files'] = [];

  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const sourcePath = join(directory, entry.name);
      const rel = relative(root, sourcePath);
      if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new InitDestinationError('Bundled starter template contains an unsafe path');
      }
      const stats = lstatSync(sourcePath);
      if (stats.isSymbolicLink()) {
        throw new InitDestinationError(`Bundled starter template contains symbolic link ${rel}`);
      }
      if (stats.isDirectory()) {
        directories.push(rel);
        visit(sourcePath);
      } else if (stats.isFile()) {
        files.push({
          relativePath: rel,
          identity: { dev: stats.dev, ino: stats.ino },
          mode: stats.mode & 0o777,
        });
      } else {
        throw new InitDestinationError(`Bundled starter template contains non-regular entry ${rel}`);
      }
    }
  };
  visit(root);
  return { directories, files };
}

function stageTemplate(root: string, destination: string, plan: TemplatePlan): void {
  mkdirSync(destination, { mode: 0o700 });
  for (const directory of plan.directories) {
    mkdirSync(join(destination, directory), { mode: 0o700 });
  }
  for (const file of plan.files) {
    const sourcePath = join(root, file.relativePath);
    let fd: number | undefined;
    try {
      fd = openSync(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(fd);
      if (!opened.isFile() || !sameFile(opened, file.identity)) {
        throw new InitDestinationError(`Bundled starter template changed during copy: ${file.relativePath}`);
      }
      writeFileSync(join(destination, file.relativePath), readFileSync(fd), {
        flag: 'wx',
        mode: file.mode,
      });
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
}

function removeBestEffort(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // Cleanup must not obscure the primary result. Unique staging names are
    // never treated as live destinations.
  }
}

async function runInitCommand(
  directory: string,
  options: { name?: string; force?: boolean },
  operations: InitOperations,
): Promise<void> {
  const targetDir = resolve(isAbsolute(directory) ? directory : join(process.cwd(), directory));
  const brandDir = join(targetDir, 'brand_atomic_system');
  const configPath = join(targetDir, 'brandkit.config.yaml');
  const force = options.force === true;

  // Validate both live destinations and every bundled source entry before
  // creating, replacing, or removing any user-owned path.
  const preflight = preflightDestinations(targetDir, force);
  const templatesDir = findTemplatesDir();
  const templatePlan = buildTemplatePlan(templatesDir);
  const brandName = options.name ?? 'Your Brand';
  const config = yaml.dump({
    version: 2,
    brand: {
      name: brandName,
      description: 'Describe your brand here.',
      root: './brand_atomic_system',
    },
    contexts: ['base', 'web', 'product'],
    ignore: ['human/'],
  });

  console.log(`Initializing BrandKit MCP v2 in ${targetDir}...`);

  let createdTarget = false;
  if (!preflight.target) {
    mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    createdTarget = true;
  }
  const targetIdentity = statSync(targetDir);
  if (!targetIdentity.isDirectory() || lstatSync(targetDir).isSymbolicLink()) {
    throw new InitDestinationError('Initialization target changed into an unsafe directory');
  }

  const nonce = `${process.pid}.${randomUUID()}`;
  const stagedBrand = join(targetDir, `.brand_atomic_system.${nonce}.tmp`);
  const stagedConfig = join(targetDir, `.brandkit.config.yaml.${nonce}.tmp`);
  const backupBrand = join(targetDir, `.brand_atomic_system.${nonce}.bak`);
  const backupConfig = join(targetDir, `.brandkit.config.yaml.${nonce}.bak`);
  let brandBackedUp = false;
  let configBackedUp = false;
  let brandInstalled = false;
  let configInstalled = false;

  try {
    stageTemplate(templatesDir, stagedBrand, templatePlan);
    mkdirSync(join(stagedBrand, 'human'), { mode: 0o700 });
    writeFileSync(
      join(stagedBrand, 'human', 'readme.md'),
      '# human/\n\nDrop PDFs, print specs, and other human-only material here.\nThe MCP scanner ignores this directory entirely.\n',
      { flag: 'wx', mode: 0o600 },
    );
    atomicWriteFile(stagedConfig, config);

    assertEntryUnchanged(targetDir, preflight.target ?? targetIdentity, 'Initialization target');
    assertEntryUnchanged(brandDir, preflight.brand, 'brand_atomic_system destination');
    assertEntryUnchanged(configPath, preflight.config, 'brandkit.config.yaml destination');

    if (preflight.brand) {
      operations.rename(brandDir, backupBrand);
      brandBackedUp = true;
    }
    if (preflight.config) {
      operations.rename(configPath, backupConfig);
      configBackedUp = true;
    }
    operations.rename(stagedBrand, brandDir);
    brandInstalled = true;
    operations.rename(stagedConfig, configPath);
    configInstalled = true;
  } catch (err) {
    // Restore the old pair if any commit step fails. Moving new entries aside
    // avoids following attacker-controlled links during rollback.
    if (configInstalled) {
      try { operations.rename(configPath, stagedConfig); } catch { /* preserve primary error */ }
    }
    if (brandInstalled) {
      try { operations.rename(brandDir, stagedBrand); } catch { /* preserve primary error */ }
    }
    if (configBackedUp) {
      try { operations.rename(backupConfig, configPath); } catch { /* preserve primary error */ }
    }
    if (brandBackedUp) {
      try { operations.rename(backupBrand, brandDir); } catch { /* preserve primary error */ }
    }
    throw err;
  } finally {
    removeBestEffort(stagedBrand);
    removeBestEffort(stagedConfig);
    if (brandInstalled && configInstalled) {
      removeBestEffort(backupBrand);
      removeBestEffort(backupConfig);
    }
    if (createdTarget) {
      try {
        if (readdirSync(targetDir).length === 0) rmSync(targetDir);
      } catch {
        // Keep a concurrently populated target directory intact.
      }
    }
  }

  if (existsSync(join(targetDir, 'brand'))) {
    console.warn(
      'Note: a legacy v1 `brand/` directory is still present and is no longer used by v2. ' +
        'Remove it once you have migrated its contents into brand_atomic_system/.',
    );
  }

  console.log('');
  console.log('BrandKit MCP initialized successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit brand_atomic_system/magic_trick.md with human-authored taste notes (AI never writes here).');
  console.log('  2. Fill in brand_atomic_system/agent/verbal/{positioning,audience,messaging,differentiation,concepts,voice}.');
  console.log('  3. Add tokens to brand_atomic_system/agent/visual/colors_and_type.css and tokens/.');
  console.log('  4. Drop logos and fonts into brand_atomic_system/agent/visual/{assets,fonts}/.');
  console.log('  5. Run `brandkit-mcp serve` to start the MCP server.');
  console.log('  6. Connect to Claude Desktop (see README.md).');
}

/** Commander-facing entry point. Keep exactly two parameters: Commander adds its own trailing arguments. */
export async function initCommand(
  directory: string,
  options: { name?: string; force?: boolean },
): Promise<void> {
  return runInitCommand(directory, options, defaultInitOperations);
}

/** Internal deterministic fault-injection seam used by transaction regressions. */
export const initCommandWithOperations = runInitCommand;
