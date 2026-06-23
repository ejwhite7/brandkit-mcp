import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { handler, TOOL_NAME } from '../tools/sync-brand-docs.js';
import { buildFixtureIndex } from './helpers.js';

function setup(): { configPath: string; outputDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'bk-sync-'));
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(configPath, 'version: 2\nbrand:\n  name: Acme\n  root: ./\n', 'utf-8');
  return { configPath, outputDir: dir };
}

function call(
  index: ReturnType<typeof buildFixtureIndex>,
  args: Record<string, string>,
  ctx: { configPath: string; outputDir: string },
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

    const savedCfg = yaml.load(readFileSync(ctx.configPath, 'utf-8')) as Record<string, any>;
    expect(savedCfg.brief.voice_words).toBe('warm, mechanical, opinionated');

    expect((payload._warnings as string[]).join(' ')).toContain('comments');
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
    const savedCfg = yaml.load(readFileSync(ctx.configPath, 'utf-8')) as Record<string, any>;
    expect(savedCfg.brief.audience).toBe('updated audience');
    expect(savedCfg.brief.anti_references).toBe('antis');
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

  it('reports unavailable when no config path is bound', async () => {
    const index = buildFixtureIndex('v2/full');
    const content = await handler(index, { audience: 'a' }, undefined);
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.ok).toBe(false);
    expect(String(payload.error)).toContain('no config path');
  });
});
