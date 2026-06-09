import {
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'fs';
import { isAbsolute, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

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

function copyRecursive(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) {
      copyRecursive(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

export async function initCommand(
  directory: string,
  options: { name?: string; force?: boolean },
): Promise<void> {
  const targetDir = isAbsolute(directory) ? directory : join(process.cwd(), directory);
  const brandDir = join(targetDir, 'brand_atomic_system');

  if (existsSync(brandDir) && !options.force) {
    console.error('brand_atomic_system/ already exists. Use --force to overwrite.');
    process.exit(1);
  }

  const brandName = options.name ?? 'Your Brand';

  console.log(`Initializing BrandKit MCP v2 in ${targetDir}...`);

  const templatesDir = findTemplatesDir();
  mkdirSync(targetDir, { recursive: true });
  // Remove any prior brand_atomic_system tree first so --force is a clean
  // overwrite rather than a partial merge that can leave stale files behind.
  rmSync(brandDir, { recursive: true, force: true });
  copyRecursive(templatesDir, brandDir);

  // The starter template ships only agent-readable content; create the
  // human/ drop zone (PDFs, print specs) that the v2 layout documents.
  mkdirSync(join(brandDir, 'human'), { recursive: true });
  writeFileSync(
    join(brandDir, 'human', 'readme.md'),
    '# human/\n\nDrop PDFs, print specs, and other human-only material here.\nThe MCP scanner ignores this directory entirely.\n',
  );

  // Build the config as an object and serialize with js-yaml so brand names
  // containing YAML metacharacters (e.g. `Acme: Corp`, `@handle`) are quoted
  // correctly instead of producing an unparseable config.
  writeFileSync(
    join(targetDir, 'brandkit.config.yaml'),
    yaml.dump({
      version: 2,
      brand: {
        name: brandName,
        description: 'Describe your brand here.',
        root: './brand_atomic_system',
      },
      contexts: ['base', 'web', 'product'],
      ignore: ['human/'],
    }),
  );

  // A v1 install leaves a `brand/` directory that v2 ignores. Warn rather
  // than silently leaving an orphaned tree alongside the new layout.
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
