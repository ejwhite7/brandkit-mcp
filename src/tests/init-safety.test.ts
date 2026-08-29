import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initCommand, initCommandWithOperations } from '../cli/commands/init.js';

const roots: string[] = [];

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'brandkit-init-safety-'));
  roots.push(root);
  return root;
}

function silenceOutput(): void {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('init destination safety', () => {
  it('rejects an existing config without force before creating a brand tree', async () => {
    silenceOutput();
    const target = freshRoot();
    const configPath = join(target, 'brandkit.config.yaml');
    const original = Buffer.from('existing-config\n');
    writeFileSync(configPath, original);

    await expect(initCommand(target, { name: 'Replacement' })).rejects.toThrow(
      /brandkit\.config\.yaml already exists.*--force/,
    );

    expect(readFileSync(configPath)).toEqual(original);
    expect(existsSync(join(target, 'brand_atomic_system'))).toBe(false);
    expect(lstatSync(configPath).isFile()).toBe(true);
  });

  it('rejects a config symlink even with force and preserves its external target', async () => {
    silenceOutput();
    const root = freshRoot();
    const target = join(root, 'project');
    mkdirSync(target);
    const external = join(root, 'external.yaml');
    const original = Buffer.from('protected-external\n');
    writeFileSync(external, original);
    const configPath = join(target, 'brandkit.config.yaml');
    symlinkSync('../external.yaml', configPath);

    await expect(initCommand(target, { force: true })).rejects.toThrow(
      /symbolic-link brandkit\.config\.yaml/,
    );

    expect(lstatSync(configPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(configPath)).toBe('../external.yaml');
    expect(readFileSync(external)).toEqual(original);
    expect(existsSync(join(target, 'brand_atomic_system'))).toBe(false);
  });

  it('rejects a hard-linked config even with force and preserves both links', async () => {
    silenceOutput();
    const root = freshRoot();
    const target = join(root, 'project');
    mkdirSync(target);
    const external = join(root, 'external.yaml');
    const configPath = join(target, 'brandkit.config.yaml');
    const original = Buffer.from('hard-linked-config\n');
    writeFileSync(external, original);
    linkSync(external, configPath);

    await expect(initCommand(target, { force: true })).rejects.toThrow(
      /hard-linked brandkit\.config\.yaml/,
    );

    expect(readFileSync(configPath)).toEqual(original);
    expect(readFileSync(external)).toEqual(original);
    expect(lstatSync(configPath).ino).toBe(lstatSync(external).ino);
    expect(existsSync(join(target, 'brand_atomic_system'))).toBe(false);
  });

  it('rejects a non-regular config even with force without changing it', async () => {
    silenceOutput();
    const target = freshRoot();
    const configPath = join(target, 'brandkit.config.yaml');
    mkdirSync(configPath);
    writeFileSync(join(configPath, 'sentinel'), 'keep-me');

    await expect(initCommand(target, { force: true })).rejects.toThrow(
      /non-regular brandkit\.config\.yaml/,
    );

    expect(lstatSync(configPath).isDirectory()).toBe(true);
    expect(readFileSync(join(configPath, 'sentinel'), 'utf8')).toBe('keep-me');
    expect(existsSync(join(target, 'brand_atomic_system'))).toBe(false);
  });

  it('rejects an existing brand directory without force and leaves every entry intact', async () => {
    silenceOutput();
    const target = freshRoot();
    const brandDir = join(target, 'brand_atomic_system');
    mkdirSync(brandDir);
    writeFileSync(join(brandDir, 'sentinel.bin'), Buffer.from([0, 1, 2, 255]));

    await expect(initCommand(target, {})).rejects.toThrow(
      /brand_atomic_system\/ already exists.*--force/,
    );

    expect(readFileSync(join(brandDir, 'sentinel.bin'))).toEqual(Buffer.from([0, 1, 2, 255]));
    expect(existsSync(join(target, 'brandkit.config.yaml'))).toBe(false);
  });

  it('rejects an unsafe brand destination even with force', async () => {
    silenceOutput();
    const root = freshRoot();
    const target = join(root, 'project');
    const external = join(root, 'external-brand');
    mkdirSync(target);
    mkdirSync(external);
    writeFileSync(join(external, 'sentinel'), 'protected');
    symlinkSync('../external-brand', join(target, 'brand_atomic_system'));

    await expect(initCommand(target, { force: true })).rejects.toThrow(
      /symbolic-link or non-directory brand_atomic_system/,
    );

    expect(readFileSync(join(external, 'sentinel'), 'utf8')).toBe('protected');
    expect(lstatSync(join(target, 'brand_atomic_system')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(target, 'brandkit.config.yaml'))).toBe(false);
  });

  it('creates a complete fresh destination', async () => {
    silenceOutput();
    const root = freshRoot();
    const target = join(root, 'new-project');

    await initCommand(target, { name: 'Fresh Brand' });

    expect(readFileSync(join(target, 'brandkit.config.yaml'), 'utf8')).toContain('Fresh Brand');
    expect(readFileSync(join(target, 'brand_atomic_system', 'magic_trick.md'), 'utf8')).toContain(
      'Magic Trick',
    );
    expect(readFileSync(join(target, 'brand_atomic_system', 'human', 'readme.md'), 'utf8')).toContain(
      'human-only',
    );
  });

  it('force cleanly replaces safe config and brand destinations', async () => {
    silenceOutput();
    const target = freshRoot();
    const brandDir = join(target, 'brand_atomic_system');
    mkdirSync(brandDir);
    writeFileSync(join(brandDir, 'stale-only.txt'), 'remove me');
    writeFileSync(join(target, 'brandkit.config.yaml'), 'old config\n');

    await initCommand(target, { name: 'Forced Brand', force: true });

    expect(existsSync(join(brandDir, 'stale-only.txt'))).toBe(false);
    expect(readFileSync(join(target, 'brandkit.config.yaml'), 'utf8')).toContain('Forced Brand');
    expect(existsSync(join(brandDir, 'magic_trick.md'))).toBe(true);
    expect(readdirSync(target).filter((entry) => entry.includes('.tmp') || entry.includes('.bak'))).toEqual([]);
  });

  it('restores both original destinations when the final commit rename fails', async () => {
    silenceOutput();
    const target = freshRoot();
    const brandDir = join(target, 'brand_atomic_system');
    const configPath = join(target, 'brandkit.config.yaml');
    const originalConfig = Buffer.from('version: 2\nbrand:\n  name: Original\n');
    const originalBrand = Buffer.from([0, 16, 32, 128, 255]);
    mkdirSync(join(brandDir, 'nested'), { recursive: true });
    writeFileSync(join(brandDir, 'nested', 'original.bin'), originalBrand);
    writeFileSync(configPath, originalConfig);

    let renameCalls = 0;
    const renameWithFinalCommitFailure: typeof renameSync = (from, to) => {
      renameCalls += 1;
      // Both originals have been backed up and the staged brand has been
      // installed when the fourth rename attempts to install the config.
      if (renameCalls === 4) {
        const error = new Error('injected final commit failure') as NodeJS.ErrnoException;
        error.code = 'EIO';
        throw error;
      }
      renameSync(from, to);
    };

    await expect(
      initCommandWithOperations(
        target,
        { name: 'Must Roll Back', force: true },
        { rename: renameWithFinalCommitFailure },
      ),
    ).rejects.toThrow('injected final commit failure');

    expect(renameCalls).toBe(7);
    expect(readFileSync(configPath)).toEqual(originalConfig);
    expect(readFileSync(join(brandDir, 'nested', 'original.bin'))).toEqual(originalBrand);
    expect(readdirSync(brandDir)).toEqual(['nested']);
    expect(readdirSync(target).sort()).toEqual(['brand_atomic_system', 'brandkit.config.yaml']);
  });
});
