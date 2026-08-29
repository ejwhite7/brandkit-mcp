import { describe, it, expect, beforeEach } from 'vitest';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { docsCommand } from '../cli/commands/docs.js';
import { DELIMITER_END, DELIMITER_START } from '../brand-docs/write.js';

const OUTPUT_NAMES = ['CLAUDE.md', 'AGENTS.md', 'SKILLS.md', 'DESIGN.md', 'PRODUCT.md'];

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

  it('refuses a protected generated-document symlink without following it', async () => {
    const magic = join(outDir, 'magic_trick.md');
    writeFileSync(magic, 'PROTECTED\n');
    symlinkSync('magic_trick.md', join(outDir, 'DESIGN.md'));

    await expect(
      docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir }),
    ).rejects.toThrow(/symbolic-link output DESIGN\.md/);
    expect(readFileSync(magic, 'utf-8')).toBe('PROTECTED\n');
  });

  it.each(OUTPUT_NAMES)(
    'preflights unsafe %s before changing any of the other four outputs',
    async (unsafeName) => {
      const originals = new Map(OUTPUT_NAMES.map((name) => {
        const content = `human bytes for ${name}   \n\n`;
        writeFileSync(join(outDir, name), content);
        return [name, content];
      }));
      const protectedPath = join(outDir, 'protected.md');
      writeFileSync(protectedPath, originals.get(unsafeName)!);
      unlinkSync(join(outDir, unsafeName));
      symlinkSync('protected.md', join(outDir, unsafeName));

      await expect(
        docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir }),
      ).rejects.toThrow(/symbolic-link output/);

      for (const [name, content] of originals) {
        expect(readFileSync(join(outDir, name), 'utf-8')).toBe(content);
      }
      expect(readFileSync(protectedPath, 'utf-8')).toBe(originals.get(unsafeName));
      expect(readdirSync(outDir).filter((name) => name.endsWith('.tmp') || name.endsWith('.bak')))
        .toEqual([]);
    },
  );

  it.each(OUTPUT_NAMES)(
    'preflights hard-linked %s before changing any output bytes',
    async (unsafeName) => {
      const originals = new Map(OUTPUT_NAMES.map((name) => {
        const content = `human bytes for ${name}\n`;
        writeFileSync(join(outDir, name), content);
        return [name, content];
      }));
      const protectedPath = join(outDir, 'protected.md');
      writeFileSync(protectedPath, originals.get(unsafeName)!);
      unlinkSync(join(outDir, unsafeName));
      linkSync(protectedPath, join(outDir, unsafeName));

      await expect(
        docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir }),
      ).rejects.toThrow(/hard-linked output/);

      for (const [name, content] of originals) {
        expect(readFileSync(join(outDir, name), 'utf-8')).toBe(content);
      }
      expect(readFileSync(protectedPath, 'utf-8')).toBe(originals.get(unsafeName));
      expect(readdirSync(outDir).filter((name) => name.endsWith('.tmp') || name.endsWith('.bak')))
        .toEqual([]);
    },
  );

  it.each(OUTPUT_NAMES)(
    'preflights malformed delimiters in %s before changing any output bytes',
    async (unsafeName) => {
      const originals = new Map(OUTPUT_NAMES.map((name) => {
        const content = name === unsafeName
          ? `${DELIMITER_START}\nbroken\n${DELIMITER_START}\n${DELIMITER_END}\n`
          : `human bytes for ${name}\n`;
        writeFileSync(join(outDir, name), content);
        return [name, content];
      }));

      await expect(
        docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir }),
      ).rejects.toThrow(/ambiguous brandkit-mcp delimiters/);

      for (const [name, content] of originals) {
        expect(readFileSync(join(outDir, name), 'utf-8')).toBe(content);
      }
      expect(readdirSync(outDir).filter((name) => name.endsWith('.tmp') || name.endsWith('.bak')))
        .toEqual([]);
    },
  );

  it.each(OUTPUT_NAMES)(
    'preflights non-regular %s before changing any regular output bytes',
    async (unsafeName) => {
      const originals = new Map(OUTPUT_NAMES
        .filter((name) => name !== unsafeName)
        .map((name) => {
          const content = `human bytes for ${name}\n`;
          writeFileSync(join(outDir, name), content);
          return [name, content];
        }));
      mkdirSync(join(outDir, unsafeName));

      await expect(
        docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir }),
      ).rejects.toThrow(/non-regular output/);

      for (const [name, content] of originals) {
        expect(readFileSync(join(outDir, name), 'utf-8')).toBe(content);
      }
      expect(readdirSync(outDir).filter((name) => name.endsWith('.tmp') || name.endsWith('.bak')))
        .toEqual([]);
    },
  );

  it('preserves human content and is byte-idempotent across all five outputs', async () => {
    const originals = new Map(OUTPUT_NAMES.map((name) => {
      const content = `human content for ${name}   \n\n`;
      writeFileSync(join(outDir, name), content);
      return [name, content];
    }));

    await docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir });
    const afterFirst = new Map(OUTPUT_NAMES.map((name) => [
      name,
      readFileSync(join(outDir, name), 'utf-8'),
    ]));
    await docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir });

    for (const name of OUTPUT_NAMES) {
      const content = readFileSync(join(outDir, name), 'utf-8');
      expect(content.startsWith(originals.get(name)!)).toBe(true);
      expect(content).toBe(afterFirst.get(name));
    }
    expect(readdirSync(outDir).filter((name) => name.endsWith('.tmp') || name.endsWith('.bak')))
      .toEqual([]);
  });
});
