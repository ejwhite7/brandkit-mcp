import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { docsCommand } from '../cli/commands/docs.js';

describe('docs command path resolution', () => {
  let configDir: string;
  let outDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'bk-docs-cfg-'));
    outDir = mkdtempSync(join(tmpdir(), 'bk-docs-out-'));
    // Minimal brand tree NEXT TO the config file, referenced relatively.
    mkdirSync(join(configDir, 'bas', 'agent', 'visual', 'tokens'), { recursive: true });
    writeFileSync(
      join(configDir, 'bas', 'agent', 'visual', 'tokens', 'color-primary.md'),
      '---\nname: color-primary\nvalue: "#112233"\ntype: color\n---\nPrimary.\n',
    );
    writeFileSync(
      join(configDir, 'brandkit.config.yaml'),
      'version: 2\nbrand:\n  name: PathTest\n  root: ./bas\n',
    );
  });

  it('resolves brand.root against the config directory, not cwd', async () => {
    await docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir });
    const claude = readFileSync(join(outDir, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('| Tokens | 1 |');

    expect(existsSync(join(outDir, 'DESIGN.md'))).toBe(true);
    expect(existsSync(join(outDir, 'PRODUCT.md'))).toBe(true);
    const product = readFileSync(join(outDir, 'PRODUCT.md'), 'utf-8');
    expect(product).toContain('PathTest — Product Brief');
  });
});
