import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { scanBrandRoot } from '../scanner/directory-scanner.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { BrandKitConfigSchema } from '../types/config.js';
import { readResource } from '../resources/index.js';

const SECRET = 'OUTSIDE_BRAND_SECRET_7d9142';
const tempBases: string[] = [];

function tempTree(): { root: string; outside: string } {
  const base = mkdtempSync(join(tmpdir(), 'bk-containment-'));
  tempBases.push(base);
  const root = join(base, 'brand');
  const outside = join(base, 'outside');
  mkdirSync(root);
  mkdirSync(outside);
  return { root, outside };
}

afterEach(() => {
  for (const base of tempBases.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

describe('brand read containment', () => {
  it('rejects outside symlinks for every fixed and discovered brand input', async () => {
    const { root, outside } = tempTree();
    const visual = join(root, 'agent', 'visual');

    write(join(outside, 'magic.md'), SECRET);
    symlinkSync(join(outside, 'magic.md'), join(root, 'magic_trick.md'));

    write(join(outside, 'positioning.md'), `# ${SECRET}`);
    mkdirSync(join(root, 'agent', 'verbal'), { recursive: true });
    symlinkSync(join(outside, 'positioning.md'), join(root, 'agent', 'verbal', 'positioning.md'));

    write(join(outside, 'audience.yaml'), `personas:\n  - name: ${SECRET}\n`);
    symlinkSync(join(outside, 'audience.yaml'), join(root, 'agent', 'verbal', 'audience.yaml'));

    write(join(outside, 'colors.css'), `:root { --color-${SECRET}: red; }`);
    mkdirSync(visual, { recursive: true });
    symlinkSync(join(outside, 'colors.css'), join(visual, 'colors_and_type.css'));

    write(join(outside, 'component.md'), `---\nname: ${SECRET}\n---\n# ${SECRET}`);
    mkdirSync(join(visual, 'components'));
    symlinkSync(join(outside, 'component.md'), join(visual, 'components', 'escape.md'));

    write(join(outside, 'token.md'), `---\nname: ${SECRET}\nvalue: red\ntype: color\n---`);
    mkdirSync(join(visual, 'tokens'));
    symlinkSync(join(outside, 'token.md'), join(visual, 'tokens', 'escape.md'));

    write(join(outside, 'motion.json'), JSON.stringify({ secret: SECRET }));
    mkdirSync(join(visual, 'motion'));
    symlinkSync(join(outside, 'motion.json'), join(visual, 'motion', 'motion.json'));

    write(join(outside, 'fonts.yaml'), `faces:\n  - family: ${SECRET}\n    file: secret.woff2\n`);
    write(join(outside, 'secret.woff2'), SECRET);
    mkdirSync(join(visual, 'fonts'));
    symlinkSync(join(outside, 'fonts.yaml'), join(visual, 'fonts', 'fonts.yaml'));
    symlinkSync(join(outside, 'secret.woff2'), join(visual, 'fonts', 'secret.woff2'));

    write(join(outside, 'assets.yaml'), `assets:\n  - id: ${SECRET}\n    file: secret.svg\n`);
    write(join(outside, 'secret.svg'), `<svg><text>${SECRET}</text></svg>`);
    mkdirSync(join(visual, 'assets'));
    symlinkSync(join(outside, 'assets.yaml'), join(visual, 'assets', 'assets.yaml'));
    symlinkSync(join(outside, 'secret.svg'), join(visual, 'assets', 'secret.svg'));

    const config = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Contained Brand', root },
    });
    const index = await buildDesignSystemIndex(config);
    const serializedIndex = JSON.stringify(index);
    expect(serializedIndex).not.toContain(SECRET);
    expect(serializedIndex).not.toContain(outside);
    expect(index.warnings.some((warning) => warning.includes('outside configured root'))).toBe(true);

    const uris = [
      'brand://overview',
      'brand://magic_trick',
      'brand://verbal/positioning',
      'brand://verbal/audience',
      'brand://visual/colors_and_type',
      'brand://visual/components',
      'brand://visual/tokens',
      'brand://visual/motion',
      'brand://visual/fonts',
      'brand://visual/assets',
    ];
    for (const uri of uris) {
      expect(JSON.stringify(await readResource(uri, index))).not.toContain(SECRET);
    }
  });

  it('rejects fixed parent and discovered directories symlinked outside the root', () => {
    const { root, outside } = tempTree();
    write(join(outside, 'verbal', 'positioning.md'), `# ${SECRET}`);
    write(join(outside, 'components', 'button.md'), `---\nname: ${SECRET}\n---`);
    write(join(outside, 'assets', 'secret.svg'), `<svg><text>${SECRET}</text></svg>`);

    mkdirSync(join(root, 'agent', 'visual'), { recursive: true });
    symlinkSync(join(outside, 'verbal'), join(root, 'agent', 'verbal'));
    symlinkSync(join(outside, 'components'), join(root, 'agent', 'visual', 'components'));
    symlinkSync(join(outside, 'assets'), join(root, 'agent', 'visual', 'assets'));

    const scan = scanBrandRoot(root);
    expect(JSON.stringify(scan)).not.toContain(SECRET);
    expect(scan.verbal.positioning).toBeUndefined();
    expect(scan.base.components).toEqual([]);
    expect(scan.base.assets).toEqual([]);
  });

  it('allows files and directories symlinked to targets that remain in the root', () => {
    const { root } = tempTree();
    write(join(root, 'shared', 'magic.md'), 'Internal magic');
    write(join(root, 'shared', 'components', 'button.md'), '---\nname: Internal Button\n---\n# Button');
    symlinkSync(join(root, 'shared', 'magic.md'), join(root, 'magic_trick.md'));
    mkdirSync(join(root, 'agent', 'visual'), { recursive: true });
    symlinkSync(join(root, 'shared', 'components'), join(root, 'agent', 'visual', 'components'));

    const scan = scanBrandRoot(root);
    expect(scan.magicTrick?.content).toBe('Internal magic');
    expect(scan.base.components.map((component) => component.name)).toContain('Internal Button');
  });

  it('rejects manifest paths that traverse outside the root', () => {
    const { root } = tempTree();
    const visual = join(root, 'agent', 'visual');
    write(
      join(visual, 'assets', 'assets.yaml'),
      `assets:\n  - id: ${SECRET}\n    file: ../../../../../outside.svg\n`,
    );
    write(
      join(visual, 'fonts', 'fonts.yaml'),
      `faces:\n  - family: ${SECRET}\n    file: ../../../../../outside.woff2\n`,
    );

    const scan = scanBrandRoot(root);
    expect(scan.base.assets).toEqual([]);
    expect(scan.base.fonts).toEqual([]);
    expect(scan.warnings.some((warning) => warning.includes('manifest entry'))).toBe(true);
  });
});
