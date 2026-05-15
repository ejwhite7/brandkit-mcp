import {
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
  writeFileSync,
  existsSync,
} from 'fs';
import { isAbsolute, join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  copyRecursive(templatesDir, brandDir);

  writeFileSync(
    join(targetDir, 'brandkit.config.yaml'),
    `version: 2
brand:
  name: ${brandName}
  description: Describe your brand here.
  root: ./brand_atomic_system
contexts: [base, web, product]
ignore:
  - human/
`,
  );

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
