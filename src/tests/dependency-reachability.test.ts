import { builtinModules } from 'module';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const ENTRY_POINTS = ['src/index.ts', 'src/cli/index.ts'];
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticImport = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = staticImport.exec(source)) !== null) specifiers.push(match[1]);
  while ((match = dynamicImport.exec(source)) !== null) specifiers.push(match[1]);
  return specifiers;
}

function resolveSourceModule(fromFile: string, specifier: string): string {
  const unresolved = resolve(dirname(fromFile), specifier);
  const candidates = [
    unresolved,
    unresolved.replace(/\.js$/, '.ts'),
    unresolved.replace(/\.mjs$/, '.mts'),
    join(unresolved, 'index.ts'),
  ];
  const match = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!match) throw new Error(`Could not resolve ${specifier} from ${fromFile}`);
  return match;
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function traceShippedSource(): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = ENTRY_POINTS.map((entry) => resolve(REPO_ROOT, entry));

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    files.add(file);

    for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) {
        pending.push(resolveSourceModule(file, specifier));
      } else if (!BUILTINS.has(specifier)) {
        packages.add(packageName(specifier));
      }
    }
  }

  return { files, packages };
}

describe('production dependency reachability', () => {
  it('keeps direct runtime dependencies aligned with shipped entry points', () => {
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const traced = traceShippedSource();

    expect([...traced.packages].sort()).toEqual(Object.keys(packageJson.dependencies).sort());
  });

  it('does not retain parser modules that shipped code cannot reach', () => {
    const traced = traceShippedSource();
    const parserDir = join(REPO_ROOT, 'src', 'parsers');
    const parserFiles = readdirSync(parserDir)
      .filter((name) => extname(name) === '.ts')
      .map((name) => join(parserDir, name))
      .sort();

    expect(parserFiles.filter((file) => !traced.files.has(file))).toEqual([]);
  });
});
