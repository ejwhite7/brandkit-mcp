import { afterEach, describe, it, expect } from 'vitest';
import { resolve, join } from 'path';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { scanBrandRoot } from '../scanner/directory-scanner.js';

const FIXTURE = resolve(__dirname, '../../__test_fixtures__/v2/full');
const EMPTY = resolve(__dirname, '../../__test_fixtures__/v2/empty');
const tempRoots: string[] = [];

function makeBrandRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'bk-scanner-'));
  tempRoots.push(root);
  return root;
}

function writeComponent(root: string, relativePath: string, name: string): void {
  const path = join(root, relativePath);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `---\nname: ${name}\n---\n# ${name}\n`);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('scanBrandRoot', () => {
  it('finds magic_trick.md', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.magicTrick?.content).toContain('Specificity beats abstraction');
  });

  it('parses all six verbal docs', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.verbal.positioning?.body).toContain('solo founders');
    expect(scan.verbal.messaging?.body).toContain('Ship on-brand');
    expect(scan.verbal.differentiation?.body).toContain('LLMs the brand');
    expect(scan.verbal.concepts?.body).toContain('Atomic system');
    expect(scan.verbal.voice?.body).toContain('Plainspoken');
    const audienceData = scan.verbal.audience?.data as { personas: unknown[] };
    expect(audienceData.personas).toHaveLength(1);
  });

  it('finds base visual content', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.base.colorsAndType?.customProperties['--color-primary']).toBe('#1a1a2e');
    expect(scan.base.components).toHaveLength(1);
    expect(scan.base.tokens).toHaveLength(1);
    expect(scan.base.motion?.tokens).toBeTruthy();
    expect(scan.base.fonts.length).toBeGreaterThanOrEqual(1);
    expect(scan.base.assets.length).toBeGreaterThanOrEqual(1);
  });

  it('finds web overrides', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.web.colorsAndType?.customProperties['--color-bg']).toBe('#fafafa');
  });

  it('finds product overrides', () => {
    const scan = scanBrandRoot(FIXTURE);
    const button = scan.product.components.find((c) => c.name === 'button');
    expect(button).toBeDefined();
  });

  it('returns empty layers + no throw on empty fixture', () => {
    const scan = scanBrandRoot(EMPTY);
    expect(scan.magicTrick).toBeUndefined();
    expect(scan.verbal.positioning).toBeUndefined();
    expect(scan.base.components).toEqual([]);
    expect(scan.base.tokens).toEqual([]);
  });

  it('ignores human/ by default', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.warnings.every((w) => !w.includes('human/'))).toBe(true);
  });

  it('terminates safely and deterministically across directory symlink cycles and aliases', () => {
    const root = makeBrandRoot();
    const components = join(root, 'agent', 'visual', 'components');
    writeComponent(root, 'agent/visual/components/base.md', 'Base');
    writeComponent(root, 'agent/visual/components/ancestor/item.md', 'Ancestor');
    writeComponent(root, 'agent/visual/components/left/item.md', 'Left');
    writeComponent(root, 'agent/visual/components/right/item.md', 'Right');
    writeComponent(root, 'agent/visual/components/library/item.md', 'Library');

    symlinkSync('.', join(components, 'self'));
    symlinkSync(components, join(components, 'ancestor', 'up'));
    symlinkSync('../right', join(components, 'left', 'to-right'));
    symlinkSync('../left', join(components, 'right', 'to-left'));
    symlinkSync('library', join(components, 'alias-a'));
    symlinkSync('library', join(components, 'alias-b'));

    const first = scanBrandRoot(root);
    const second = scanBrandRoot(root);
    const names = first.base.components.map((component) => component.name);

    expect(names).toEqual(['Library', 'Ancestor', 'Base', 'Left', 'Right']);
    expect(second.base.components.map((component) => component.source)).toEqual(
      first.base.components.map((component) => component.source),
    );
  });

  it('matches normalized ignore paths from the brand root with directory boundaries', () => {
    const root = makeBrandRoot();
    writeComponent(root, 'agent/visual/components/human/hidden.md', 'Hidden Base');
    writeComponent(root, 'agent/visual/components/humanity/visible.md', 'Base Humanity');
    writeComponent(root, 'agent/visual/artifacts/web/components/human/visible.md', 'Web Human');
    writeComponent(root, 'agent/visual/artifacts/web/components/private/hidden.md', 'Hidden Web');
    writeComponent(root, 'agent/visual/artifacts/web/components/privateer/visible.md', 'Web Privateer');
    writeComponent(root, 'agent/visual/artifacts/product/components/internal/hidden.md', 'Hidden Product');
    writeComponent(
      root,
      'agent/visual/artifacts/product/components/internalized/visible.md',
      'Product Internalized',
    );

    const scan = scanBrandRoot(root, {
      ignore: [
        './agent\\visual/components/human/',
        'agent/visual/artifacts/web/components/private/./',
        'agent/visual/artifacts/product/components/staging/../internal',
        '/agent/visual/components/humanity',
        '../../agent/visual/artifacts/web/components/human',
        'C:\\agent\\visual\\artifacts\\product\\components\\internalized',
      ],
    });

    expect(scan.base.components.map((component) => component.name)).toEqual(['Base Humanity']);
    expect(scan.web.components.map((component) => component.name)).toEqual([
      'Web Human',
      'Web Privateer',
    ]);
    expect(scan.product.components.map((component) => component.name)).toEqual([
      'Product Internalized',
    ]);
    expect(
      scan.warnings.filter((warning) => warning.includes('invalid ignore pattern')),
    ).toHaveLength(3);
  });

  it('can ignore one context artifact directory without hiding sibling contexts', () => {
    const root = makeBrandRoot();
    writeComponent(root, 'agent/visual/artifacts/web/components/web.md', 'Web');
    writeComponent(root, 'agent/visual/artifacts/product/components/product.md', 'Product');

    const scan = scanBrandRoot(root, { ignore: ['agent/visual/artifacts/web/'] });

    expect(scan.web.components).toEqual([]);
    expect(scan.product.components.map((component) => component.name)).toEqual(['Product']);
  });
});

describe('css-only motion systems', () => {
  it('does not warn about missing motion.json when motion.css exists', () => {
    const root = makeBrandRoot();
    const motionDir = join(root, 'agent', 'visual', 'motion');
    mkdirSync(motionDir, { recursive: true });
    writeFileSync(join(motionDir, 'motion.css'), '.fade { transition: opacity 200ms; }\n');
    const scan = scanBrandRoot(root);
    expect(scan.warnings.find((w) => w.includes('No motion.json'))).toBeUndefined();
    expect(scan.base.motion?.css).toContain('.fade');
  });
});
