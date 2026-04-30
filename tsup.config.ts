/**
 * tsup build configuration for BrandKit MCP.
 *
 * Produces both CommonJS and ESM outputs with TypeScript declarations.
 * Two entry points:
 *   - index: Main library entry (MCP server, parsers, types)
 *   - cli/index: CLI binary entry for the `brandkit-mcp` command
 */
import { defineConfig } from 'tsup';

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
});

