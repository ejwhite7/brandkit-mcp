import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { scanBrandRoot } from '../scanner/directory-scanner.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { BrandKitConfigSchema } from '../types/config.js';
import * as getAssets from '../tools/get-assets.js';
import * as getFonts from '../tools/get-fonts.js';

const roots: string[] = [];

function makeBrandRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'bk-manifest-'));
  roots.push(root);
  return root;
}

function write(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('manifest runtime validation', () => {
  it('skips mixed malformed entries while preserving valid assets and fonts end to end', async () => {
    const root = makeBrandRoot();
    const fontsDir = join(root, 'agent', 'visual', 'fonts');
    const assetsDir = join(root, 'agent', 'visual', 'assets');

    write(join(fontsDir, 'valid-500-italic.woff2'), Buffer.from('font'));
    write(join(assetsDir, 'valid.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    write(
      join(fontsDir, 'fonts.yaml'),
      [
        'faces:',
        '  -',
        '  - scalar',
        '  - [array-entry]',
        '  - file: { nested: value }',
        '  - file: invalid-family.woff2',
        '    family: [nested, family]',
        '  - constructor: { file: inherited.woff2 }',
        '  - __proto__: ignored',
        '    prototype: ignored',
        '    file: valid-500-italic.woff2',
        '    family: Valid Family',
        '    weight: 500',
        '    style: italic',
        '',
      ].join('\n'),
    );
    write(
      join(assetsDir, 'assets.yaml'),
      [
        'assets:',
        '  -',
        '  - scalar',
        '  - [array-entry]',
        '  - file: { nested: value }',
        '  - file: invalid-purpose.svg',
        '    purpose: { nested: purpose }',
        '  - prototype: { file: inherited.svg }',
        '  - constructor: ignored',
        '    __proto__: ignored',
        '    file: valid.svg',
        '    id: valid-logo',
        '    purpose: Primary logo',
        '',
      ].join('\n'),
    );

    const scan = scanBrandRoot(root);
    expect(scan.base.fonts).toEqual([
      expect.objectContaining({
        file: 'valid-500-italic.woff2',
        family: 'Valid Family',
        weight: 500,
        style: 'italic',
      }),
    ]);
    expect(scan.base.assets).toEqual([
      expect.objectContaining({
        file: 'valid.svg',
        id: 'valid-logo',
        purpose: 'Primary logo',
      }),
    ]);
    expect(scan.warnings).toEqual([
      'Rejected font manifest entry agent/visual/fonts/fonts.yaml faces[0]: expected an object',
      'Rejected font manifest entry agent/visual/fonts/fonts.yaml faces[1]: expected an object',
      'Rejected font manifest entry agent/visual/fonts/fonts.yaml faces[2]: expected an object',
      'Rejected font manifest entry agent/visual/fonts/fonts.yaml faces[3]: file must be a non-empty string',
      'Rejected font manifest entry agent/visual/fonts/fonts.yaml faces[4]: family must be a string',
      'Rejected font manifest entry agent/visual/fonts/fonts.yaml faces[5]: file must be a non-empty string',
      'Rejected asset manifest entry agent/visual/assets/assets.yaml assets[0]: expected an object',
      'Rejected asset manifest entry agent/visual/assets/assets.yaml assets[1]: expected an object',
      'Rejected asset manifest entry agent/visual/assets/assets.yaml assets[2]: expected an object',
      'Rejected asset manifest entry agent/visual/assets/assets.yaml assets[3]: file must be a non-empty string',
      'Rejected asset manifest entry agent/visual/assets/assets.yaml assets[4]: purpose must be a string',
      'Rejected asset manifest entry agent/visual/assets/assets.yaml assets[5]: file must be a non-empty string',
    ]);

    const config = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Manifest Brand', root },
    });
    const index = await buildDesignSystemIndex(config);
    const assetsPayload = JSON.parse(getAssets.handler(index, { context: 'base' })[0].text);
    const fontsPayload = JSON.parse(getFonts.handler(index, { context: 'base' })[0].text);

    expect(assetsPayload.assets).toEqual(index.contexts.base.assets);
    expect(fontsPayload.faces).toEqual(index.contexts.base.fonts);
    expect(() => JSON.stringify(index)).not.toThrow();
    expect(Object.prototype).not.toHaveProperty('ignored');
  });

  it.each([
    ['fonts', 'agent/visual/fonts/fonts.yaml', 'scalar', 'expected a mapping'],
    ['fonts', 'agent/visual/fonts/fonts.yaml', '- array', 'expected a mapping'],
    ['fonts', 'agent/visual/fonts/fonts.yaml', 'faces: scalar', 'faces must be an array'],
    ['assets', 'agent/visual/assets/assets.yaml', 'null', 'expected a mapping'],
    ['assets', 'agent/visual/assets/assets.yaml', '- array', 'expected a mapping'],
    ['assets', 'agent/visual/assets/assets.yaml', 'assets: scalar', 'assets must be an array'],
  ])('warns for an invalid %s manifest envelope', (kind, relativePath, yaml, reason) => {
    const root = makeBrandRoot();
    write(join(root, relativePath), `${yaml}\n`);

    const scan = scanBrandRoot(root);

    expect(scan.base.fonts).toEqual([]);
    expect(scan.base.assets).toEqual([]);
    expect(scan.warnings).toContain(
      `Rejected ${kind === 'fonts' ? 'font' : 'asset'} manifest ${relativePath}: ${reason}`,
    );
  });
});
