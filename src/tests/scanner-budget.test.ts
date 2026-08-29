import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { scanBrandRoot, type ScanOptions } from '../scanner/directory-scanner.js';
import { BrandReadPolicy } from '../filesystem/brand-read-policy.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'bk-budget-'));
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string | Buffer): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function limits(overrides: Partial<NonNullable<ScanOptions['limits']>>): ScanOptions {
  return {
    limits: {
      maxFileBytes: 32,
      maxTotalBytes: 128,
      maxFiles: 20,
      maxDepth: 16,
      ...overrides,
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('brand ingestion budgets', () => {
  it('accepts the exact per-file boundary and rejects a larger declared asset before reading it', () => {
    const exactRoot = makeRoot();
    write(exactRoot, 'agent/visual/assets/logo.png', Buffer.alloc(8));

    expect(() => scanBrandRoot(exactRoot, limits({ maxFileBytes: 8, maxTotalBytes: 16 })))
      .not.toThrow();

    const overRoot = makeRoot();
    write(
      overRoot,
      'agent/visual/assets/assets.yaml',
      'assets:\n  - id: logo\n    file: logo.bin\n',
    );
    write(overRoot, 'agent/visual/assets/logo.bin', Buffer.alloc(41));

    expect(() => scanBrandRoot(overRoot, limits({ maxFileBytes: 40, maxTotalBytes: 128 })))
      .toThrow('Brand ingestion per-file byte limit exceeded at agent/visual/assets/logo.bin: 41 bytes; maximum 40');
  });

  it('accepts the exact aggregate-byte boundary and rejects one additional byte', () => {
    const exactRoot = makeRoot();
    write(exactRoot, 'magic_trick.md', '1234');
    write(exactRoot, 'agent/verbal/positioning.md', '5678');

    expect(() => scanBrandRoot(exactRoot, limits({ maxFileBytes: 8, maxTotalBytes: 8 })))
      .not.toThrow();

    const overRoot = makeRoot();
    write(overRoot, 'magic_trick.md', '1234');
    write(overRoot, 'agent/verbal/positioning.md', '5678');
    write(overRoot, 'agent/verbal/messaging.md', '9');

    expect(() => scanBrandRoot(overRoot, limits({ maxFileBytes: 8, maxTotalBytes: 8 })))
      .toThrow('Brand ingestion aggregate byte limit exceeded at agent/verbal/messaging.md: 9 bytes; maximum 8');
  });

  it('accepts the exact unique-file boundary and rejects the next file', () => {
    const exactRoot = makeRoot();
    write(exactRoot, 'magic_trick.md', 'a');
    write(exactRoot, 'agent/verbal/positioning.md', 'b');

    expect(() => scanBrandRoot(exactRoot, limits({ maxFiles: 2 }))).not.toThrow();

    const overRoot = makeRoot();
    write(overRoot, 'magic_trick.md', 'a');
    write(overRoot, 'agent/verbal/positioning.md', 'b');
    write(overRoot, 'agent/verbal/messaging.md', 'c');

    expect(() => scanBrandRoot(overRoot, limits({ maxFiles: 2 })))
      .toThrow('Brand ingestion file-count limit exceeded at agent/verbal/messaging.md: 3 files; maximum 2');
  });

  it('accepts the exact path-depth boundary and rejects a deeper traversal', () => {
    const exactRoot = makeRoot();
    write(exactRoot, 'agent/visual/components/a/item.md', '# Exact\n');

    expect(() => scanBrandRoot(exactRoot, limits({ maxDepth: 5 }))).not.toThrow();

    const overRoot = makeRoot();
    write(overRoot, 'agent/visual/components/a/b/item.md', '# Too deep\n');

    expect(() => scanBrandRoot(overRoot, limits({ maxDepth: 5 })))
      .toThrow('Brand ingestion traversal depth limit exceeded at agent/visual/components/a/b/item.md: 6 levels; maximum 5');
  });

  it('applies depth limits to canonical in-root targets reached through shallow aliases', () => {
    const exactRoot = makeRoot();
    const exactTarget = write(exactRoot, 'library/a/b/exact.md', '# Exact alias\n');
    mkdirSync(join(exactRoot, 'agent', 'visual', 'components'), { recursive: true });
    symlinkSync(exactTarget, join(exactRoot, 'agent', 'visual', 'components', 'alias.md'));

    expect(() => scanBrandRoot(exactRoot, limits({ maxDepth: 4 }))).not.toThrow();

    const overRoot = makeRoot();
    const overTarget = write(overRoot, 'library/a/b/c/too-deep.md', '# Deep alias\n');
    mkdirSync(join(overRoot, 'agent', 'visual', 'components'), { recursive: true });
    symlinkSync(overTarget, join(overRoot, 'agent', 'visual', 'components', 'alias.md'));

    expect(() => scanBrandRoot(overRoot, limits({ maxDepth: 4 }))).toThrow(
      'Brand ingestion traversal depth limit exceeded at library/a/b/c/too-deep.md: 5 levels; maximum 4',
    );
  });

  it('counts in-root symlink aliases by canonical file identity only once', () => {
    const root = makeRoot();
    const source = write(root, 'agent/visual/components/source.md', '# Source\n');
    symlinkSync(source, join(dirname(source), 'alias.md'));

    expect(() => scanBrandRoot(root, limits({
      maxFileBytes: 9,
      maxTotalBytes: 9,
      maxFiles: 1,
    }))).not.toThrow();
  });

  it('returns the same redacted error independent of the absolute brand root', () => {
    const messages = [makeRoot(), makeRoot()].map((root) => {
      write(root, 'magic_trick.md', '12345');
      try {
        scanBrandRoot(root, limits({ maxFileBytes: 4, maxTotalBytes: 4 }));
      } catch (error) {
        return (error as Error).message;
      }
      throw new Error('Expected scan to exceed its per-file budget');
    });

    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).not.toContain('/tmp/');
  });

  it('rechecks an already-discovered inode before allocating its grown content', () => {
    const root = makeRoot();
    const path = write(root, 'magic_trick.md', '1234');
    const reader = new BrandReadPolicy(root, {
      maxFileBytes: 4,
      maxTotalBytes: 4,
      maxFiles: 1,
      maxDepth: 1,
    });

    expect(reader.isFile(path)).toBe(true);
    writeFileSync(path, '12345');
    expect(() => reader.readFile(path, 'utf8')).toThrow(
      'Brand ingestion per-file byte limit exceeded at magic_trick.md: 5 bytes; maximum 4',
    );
  });

  it('bounds directory enumeration even when entries contain no ingestible files', () => {
    const root = makeRoot();
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      mkdirSync(join(root, 'agent', 'visual', 'components', name), { recursive: true });
    }

    expect(() => scanBrandRoot(root, limits({ maxFiles: 1 }))).toThrow(
      'Brand ingestion traversal entry limit exceeded at agent/visual/components: more than 4 entries',
    );
  });
});
