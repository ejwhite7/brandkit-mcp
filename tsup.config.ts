/**
 * tsup build configuration for BrandKit MCP.
 *
 * Produces both CommonJS and ESM outputs with TypeScript declarations.
 * Two entry points:
 *   - index: Main library entry (MCP server, parsers, types)
 *   - cli/index: CLI binary entry for the `brandkit-mcp` command
 */
import { defineConfig } from 'tsup';
import { execSync } from 'child_process';
import * as fs from 'fs';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  shims: true,
  onSuccess: async () => {
    // Copy preview templates and static assets into dist so that the
    // preview server can locate them at runtime via __dirname.
    const dirs: [string, string][] = [
      ['src/preview/templates', 'dist/preview/templates'],
      ['src/preview/static', 'dist/preview/static'],
    ];
    for (const [src, dest] of dirs) {
      if (fs.existsSync(src)) {
        fs.mkdirSync(dest, { recursive: true });
        execSync(`cp -r ${src}/. ${dest}/`);
        console.log(`Copied ${src} -> ${dest}`);
      }
    }
  },
});
