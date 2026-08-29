import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadSafeYaml,
  sanitizeYamlGraph,
  yamlGraphBudget,
} from '../parsers/safe-yaml.js';
import { parseFrontmatter } from '../parsers/frontmatter.js';
import { parseVerbalDoc } from '../parsers/verbal-parser.js';
import { BrandReadPolicy } from '../filesystem/brand-read-policy.js';
import { BrandKitConfigSchema } from '../types/config.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { handler as getAudience } from '../tools/get-audience.js';
import { handler as getVoice } from '../tools/get-voice.js';
import { handler as getComponents } from '../tools/get-components.js';
import { handler as getTokens } from '../tools/get-tokens.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-safe-yaml-'));
  tempDirs.push(dir);
  return dir;
}

function aliasBomb(): string {
  let source = 'a: &a [x,x,x,x,x,x,x,x,x,x]\n';
  for (const [name, prior] of [['b', 'a'], ['c', 'b'], ['d', 'c'], ['e', 'd'], ['f', 'e']]) {
    source += `${name}: &${name} [*${prior},*${prior},*${prior},*${prior},*${prior},*${prior},*${prior},*${prior},*${prior},*${prior}]\n`;
  }
  return source;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('safe YAML graph boundary', () => {
  it('accepts exact node, text, and depth boundaries and rejects one over', () => {
    expect(sanitizeYamlGraph(['a', 'b', 'c'], {
      maxNodes: 4,
      maxTextBytes: 3,
      maxDepth: 1,
    })).toEqual(['a', 'b', 'c']);

    expect(() => sanitizeYamlGraph(['a', 'b', 'c', 'd'], {
      maxNodes: 4,
      maxTextBytes: 4,
      maxDepth: 1,
    })).toThrow(/4-node limit/);
    expect(() => sanitizeYamlGraph(['aa', 'bb'], {
      maxNodes: 3,
      maxTextBytes: 3,
      maxDepth: 1,
    })).toThrow(/3-byte expanded-text limit/);
    expect(sanitizeYamlGraph([[null]], {
      maxNodes: 3,
      maxTextBytes: 0,
      maxDepth: 2,
    })).toEqual([[null]]);
    expect(() => sanitizeYamlGraph([[null]], {
      maxNodes: 3,
      maxTextBytes: 0,
      maxDepth: 1,
    })).toThrow(/1-level depth limit/);
  });

  it('derives finite budgets from tiny and large bounded inputs', () => {
    expect(yamlGraphBudget(0)).toEqual({
      maxNodes: 256,
      maxTextBytes: 4096,
      maxDepth: 64,
    });
    expect(yamlGraphBudget(Number.MAX_SAFE_INTEGER)).toEqual({
      maxNodes: 100_000,
      maxTextBytes: 16 * 1024 * 1024,
      maxDepth: 64,
    });
  });

  it('rejects cycles and multiplicative aliases before serialization', () => {
    expect(() => loadSafeYaml('self: &self\n  value: *self\n')).toThrow(/aliases form a cycle/);
    expect(() => loadSafeYaml(aliasBomb())).toThrow(/YAML (structure|text) exceeds/);
  });

  it('copies small aliases independently and preserves safe merge behavior', () => {
    const result = loadSafeYaml(
      'defaults: &defaults\n  role: viewer\nfirst: *defaults\nsecond: *defaults\nuser:\n  <<: *defaults\n  name: Ada\n',
    ) as Record<string, Record<string, unknown>>;

    expect(result).toEqual({
      defaults: { role: 'viewer' },
      first: { role: 'viewer' },
      second: { role: 'viewer' },
      user: { role: 'viewer', name: 'Ada' },
    });
    expect(result.first).not.toBe(result.defaults);
    expect(result.second).not.toBe(result.defaults);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('normalizes supported scalars and preserves reserved-looking keys as data', () => {
    const result = loadSafeYaml(
      '__proto__: safe\nconstructor: value\nwhen: 2026-08-29\nzero: 0\nenabled: false\n',
    ) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(result.__proto__).toBe('safe');
    expect(result.constructor).toBe('value');
    expect(result.when).toBe('2026-08-29T00:00:00.000Z');
    expect(result.zero).toBe(0);
    expect(result.enabled).toBe(false);
    expect(loadSafeYaml('')).toBeNull();
  });
});

describe('frontmatter and index consumers', () => {
  it('preserves BOM, CRLF, nested frontmatter, and safe aliases', () => {
    const parsed = parseFrontmatter(
      '\uFEFF---\r\ndefaults: &defaults\r\n  owner: design\r\nmetadata: *defaults\r\n---\r\nBody\r\n',
    );
    expect(parsed.data).toEqual({
      defaults: { owner: 'design' },
      metadata: { owner: 'design' },
    });
    expect(parsed.content).toBe('Body\r\n');
  });

  it('tolerates cyclic frontmatter without retaining a cyclic graph', () => {
    const root = tempDir();
    const path = join(root, 'voice.md');
    const source = '---\nself: &self\n  value: *self\n---\n# Voice\n\nClear.\n';
    writeFileSync(path, source);

    expect(() => parseFrontmatter(source)).toThrow(/aliases form a cycle/);
    const doc = parseVerbalDoc(path, new BrandReadPolicy(root));
    expect(doc?.frontmatter).toEqual({});
    expect(doc?.body).toBe(source.trim());
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it('keeps an index and verbal tool serializable after cyclic frontmatter', async () => {
    const root = tempDir();
    const verbalDir = join(root, 'agent', 'verbal');
    mkdirSync(verbalDir, { recursive: true });
    const source = '---\nself: &self\n  value: *self\n---\n# Voice\n\nClear.\n';
    writeFileSync(join(verbalDir, 'voice.md'), source);

    const config = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Bounded Brand', root },
    });
    const index = await buildDesignSystemIndex(config, root);
    const response = getVoice(index);

    expect(index.verbal.voice?.frontmatter).toEqual({});
    expect(index.verbal.voice?.body).toBe(source.trim());
    expect(() => JSON.stringify(index)).not.toThrow();
    expect(JSON.parse(response[0].text)).toMatchObject({
      content: source.trim(),
      frontmatter: {},
    });
  });

  it('drops an amplifying audience graph and keeps tool output serializable', async () => {
    const root = tempDir();
    const verbalDir = join(root, 'agent', 'verbal');
    mkdirSync(verbalDir, { recursive: true });
    writeFileSync(join(verbalDir, 'audience.yaml'), aliasBomb());

    const config = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Bounded Brand', root },
    });
    const index = await buildDesignSystemIndex(config, root);

    expect(index.verbal.audience).toBeUndefined();
    expect(index.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/Invalid YAML.*YAML (structure|text) exceeds/),
    ]));
    const response = getAudience(index);
    expect(() => JSON.stringify(index)).not.toThrow();
    expect(Buffer.byteLength(response[0].text)).toBeLessThan(16_000);
    expect(JSON.parse(response[0].text)).toMatchObject({ data: null });
  });

  it('contains cyclic and amplifying component and token frontmatter per file', async () => {
    const root = tempDir();
    const componentsDir = join(root, 'agent', 'visual', 'components');
    const tokensDir = join(root, 'agent', 'visual', 'tokens');
    mkdirSync(componentsDir, { recursive: true });
    mkdirSync(tokensDir, { recursive: true });

    writeFileSync(
      join(componentsDir, 'cycle.md'),
      '---\nself: &self\n  value: *self\n---\n# Cycle-safe Card\n\nUsable body.\n',
    );
    writeFileSync(
      join(componentsDir, 'amplifying.md'),
      `---\n${aliasBomb()}---\n# Bounded Button\n\nUsable body.\n`,
    );
    writeFileSync(
      join(componentsDir, 'valid.md'),
      '---\nname: Valid Input\ncategory: forms\n---\n# Valid Input\n',
    );
    writeFileSync(
      join(tokensDir, 'cycle.md'),
      '---\nname: unsafe-cycle\ntype: color\nvalue: red\nself: &self\n  value: *self\n---\n',
    );
    writeFileSync(
      join(tokensDir, 'amplifying.md'),
      `---\nname: unsafe-amplification\ntype: color\nvalue: red\n${aliasBomb()}---\n`,
    );
    writeFileSync(
      join(tokensDir, 'valid.md'),
      '---\nname: safe-color\ntype: color\nvalue: "#123456"\n---\n',
    );

    const config = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Bounded Brand', root },
    });
    const index = await buildDesignSystemIndex(config, root);

    expect(index.contexts.base.components.map((component) => component.name).sort()).toEqual([
      'Bounded Button',
      'Cycle-safe Card',
      'Valid Input',
    ]);
    expect(index.contexts.base.tokens.map((token) => token.name)).toEqual(['safe-color']);
    expect(index.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/Invalid component frontmatter.*aliases form a cycle.*using markdown body/),
      expect.stringMatching(/Invalid component frontmatter.*YAML (structure|text) exceeds.*using markdown body/),
      expect.stringMatching(/Invalid token frontmatter.*aliases form a cycle.*skipping/),
      expect.stringMatching(/Invalid token frontmatter.*YAML (structure|text) exceeds.*skipping/),
    ]));

    const componentResponse = getComponents(index, {});
    const tokenResponse = getTokens(index, {});
    expect(() => JSON.stringify(index)).not.toThrow();
    expect(Buffer.byteLength(componentResponse[0].text)).toBeLessThan(32_000);
    expect(Buffer.byteLength(tokenResponse[0].text)).toBeLessThan(16_000);
    expect(JSON.parse(componentResponse[0].text).components).toHaveLength(3);
    expect(JSON.parse(tokenResponse[0].text).tokens).toHaveLength(1);
  });
});
