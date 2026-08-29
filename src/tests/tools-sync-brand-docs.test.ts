import { describe, it, expect } from 'vitest';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { handler, TOOL_NAME, type SyncContext } from '../tools/sync-brand-docs.js';
import { buildFixtureIndex } from './helpers.js';

function setup(): SyncContext {
  const dir = mkdtempSync(join(tmpdir(), 'bk-sync-'));
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(configPath, 'version: 2\nbrand:\n  name: Acme\n  root: ./\n', 'utf-8');
  const entry = lstatSync(configPath);
  return {
    configPath,
    outputDir: dir,
    configIdentity: { dev: entry.dev, ino: entry.ino },
  };
}

function call(
  index: ReturnType<typeof buildFixtureIndex>,
  args: Record<string, string>,
  ctx: SyncContext,
) {
  return handler(index, args, ctx);
}

describe('sync_brand_docs', () => {
  it('exposes the expected tool name', () => {
    expect(TOOL_NAME).toBe('sync_brand_docs');
  });

  it('returns the missing questions and writes nothing when incomplete', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    const content = await call(index, { audience: 'solo founders' }, ctx);
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('needs_answers');
    expect((payload.questions as string[]).length).toBe(3);
    expect(existsSync(join(ctx.outputDir, 'DESIGN.md'))).toBe(false);
  });

  it('persists the brief and writes both files when complete', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    const content = await call(
      index,
      {
        audience: 'solo founders between meetings',
        voiceWords: 'warm, mechanical, opinionated',
        visualReferences: 'Klim specimen pages',
        antiReferences: 'generic SaaS dashboards',
      },
      ctx,
    );
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('written');
    expect(existsSync(join(ctx.outputDir, 'DESIGN.md'))).toBe(true);
    expect(existsSync(join(ctx.outputDir, 'PRODUCT.md'))).toBe(true);

    const savedCfg = yaml.load(readFileSync(ctx.configPath, 'utf-8')) as Record<string, unknown>;
    const savedBrief = savedCfg.brief as Record<string, string>;
    expect(savedBrief.voice_words).toBe('warm, mechanical, opinionated');

    expect((payload._warnings as string[]).join(' ')).toContain('comments');
  });

  it('atomically replaces a regular config, preserves permissions, and supports another sync', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    chmodSync(ctx.configPath, 0o640);
    const before = lstatSync(ctx.configPath);
    const args = {
      audience: 'first audience',
      voiceWords: 'warm, mechanical, opinionated',
      visualReferences: 'Klim specimen pages',
      antiReferences: 'generic SaaS dashboards',
    };

    const first = JSON.parse((await call(index, args, ctx))[0].text) as Record<string, unknown>;
    const afterFirst = lstatSync(ctx.configPath);
    expect(first.savedConfig).toBe(true);
    expect(afterFirst.ino).not.toBe(before.ino);
    expect(afterFirst.mode & 0o777).toBe(0o640);

    const second = JSON.parse((await call(index, { ...args, audience: 'second audience' }, ctx))[0].text) as Record<string, unknown>;
    expect(second.savedConfig).toBe(true);
    const savedCfg = yaml.load(readFileSync(ctx.configPath, 'utf-8')) as Record<string, unknown>;
    expect((savedCfg.brief as Record<string, string>).audience).toBe('second audience');
  });

  it('merges new answers over a brief already in the config', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    writeFileSync(
      ctx.configPath,
      'version: 2\nbrand:\n  name: Acme\n  root: ./\nbrief:\n  audience: existing audience\n  voice_words: a, b, c\n  visual_references: refs\n  anti_references: antis\n',
      'utf-8',
    );
    const content = await call(index, { audience: 'updated audience' }, ctx);
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('written');
    const savedCfg = yaml.load(readFileSync(ctx.configPath, 'utf-8')) as Record<string, unknown>;
    const savedBrief = savedCfg.brief as Record<string, string>;
    expect(savedBrief.audience).toBe('updated audience');
    expect(savedBrief.anti_references).toBe('antis');
  });

  it('never writes a magic_trick.md', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    await call(
      index,
      { audience: 'a', voiceWords: 'b', visualReferences: 'c', antiReferences: 'd' },
      ctx,
    );
    expect(existsSync(join(ctx.outputDir, 'magic_trick.md'))).toBe(false);
  });

  it('reports output symlinks and never changes magic_trick.md', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    const magic = join(ctx.outputDir, 'magic_trick.md');
    writeFileSync(magic, 'PROTECTED MAGIC\n');
    symlinkSync('magic_trick.md', join(ctx.outputDir, 'DESIGN.md'));

    const content = await call(
      index,
      { audience: 'a', voiceWords: 'b', visualReferences: 'c', antiReferences: 'd' },
      ctx,
    );
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.ok).toBe(false);
    expect(payload.status).toBe('write_failed');
    expect(payload.savedConfig).toBe(true);
    expect(String(payload.error)).toContain('symbolic-link output DESIGN.md');
    expect(readFileSync(magic, 'utf-8')).toBe('PROTECTED MAGIC\n');
    expect(existsSync(join(ctx.outputDir, 'PRODUCT.md'))).toBe(false);
  });

  it('reports unavailable when no config path is bound', async () => {
    const index = buildFixtureIndex('v2/full');
    const content = await handler(index, { audience: 'a' }, undefined);
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.ok).toBe(false);
    expect(String(payload.error)).toContain('no config path');
  });

  it('refuses to overwrite a config it could not read as v2, but still writes the docs', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    // A config missing `version: 2` — must not be clobbered.
    const original = 'brand:\n  name: NoVersion\n  root: ./\n';
    writeFileSync(ctx.configPath, original, 'utf-8');
    const content = await call(
      index,
      { audience: 'a', voiceWords: 'b', visualReferences: 'c', antiReferences: 'd' },
      ctx,
    );
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('written');
    expect(payload.savedConfig).toBe(false);
    // Config file is untouched.
    expect(readFileSync(ctx.configPath, 'utf-8')).toBe(original);
    // Docs are still generated.
    expect(existsSync(join(ctx.outputDir, 'DESIGN.md'))).toBe(true);
    expect(existsSync(join(ctx.outputDir, 'PRODUCT.md'))).toBe(true);
    expect((payload._warnings as string[]).join(' ')).toContain('refusing to overwrite');
  });

  it.each([
    ['magic_trick.md', false],
    ['external.yaml', true],
  ])('rejects a post-registration config symlink to %s without importing or changing it', async (name, externalTarget) => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    const externalDir = mkdtempSync(join(tmpdir(), 'bk-sync-protected-'));
    const target = externalTarget ? join(externalDir, name) : join(ctx.outputDir, name);
    const protectedConfig =
      'version: 2\nbrand:\n  name: Redirected\n  root: ./\nbrief:\n  audience: OUTSIDE SECRET\n  voice_words: outside\n  visual_references: outside\n  anti_references: outside\n';
    writeFileSync(target, protectedConfig);
    unlinkSync(ctx.configPath);
    symlinkSync(target, ctx.configPath);

    const content = await call(
      index,
      { audience: 'a', voiceWords: 'b', visualReferences: 'c', antiReferences: 'd' },
      ctx,
    );
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('written');
    expect(payload.savedConfig).toBe(false);
    expect(payload.brief).toEqual({
      audience: 'a',
      voice_words: 'b',
      visual_references: 'c',
      anti_references: 'd',
    });
    expect(readFileSync(target, 'utf-8')).toBe(protectedConfig);
    expect(content[0].text).not.toContain('OUTSIDE SECRET');
    expect(content[0].text).not.toContain(externalDir);
  });

  it('rejects post-registration hard links, non-regular files, and regular replacements', async () => {
    const index = buildFixtureIndex('v2/full');
    const args = { audience: 'a', voiceWords: 'b', visualReferences: 'c', antiReferences: 'd' };

    for (const replacement of ['hard-link', 'directory', 'regular-replacement'] as const) {
      const ctx = setup();
      const protectedDir = mkdtempSync(join(tmpdir(), 'bk-sync-protected-'));
      const protectedFile = join(protectedDir, 'outside.yaml');
      const protectedBytes = 'version: 2\nbrand:\n  name: Protected\n  root: ./\n';
      writeFileSync(protectedFile, protectedBytes);
      unlinkSync(ctx.configPath);
      if (replacement === 'hard-link') linkSync(protectedFile, ctx.configPath);
      if (replacement === 'directory') mkdirSync(ctx.configPath);
      if (replacement === 'regular-replacement') renameSync(protectedFile, ctx.configPath);

      const payload = JSON.parse((await call(index, args, ctx))[0].text) as Record<string, unknown>;
      expect(payload.status).toBe('written');
      expect(payload.savedConfig).toBe(false);
      if (replacement === 'hard-link') {
        expect(readFileSync(protectedFile, 'utf-8')).toBe(protectedBytes);
      } else if (replacement === 'regular-replacement') {
        expect(readFileSync(ctx.configPath, 'utf-8')).toBe(protectedBytes);
      }
    }
  });
});
