import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseYamlFile } from '../parsers/yaml-parser.js';
import { BrandReadPolicy } from '../filesystem/brand-read-policy.js';

function fixture(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-yaml-'));
  const path = join(dir, 'fixture.yaml');
  writeFileSync(path, content);
  return path;
}

describe('parseYamlFile', () => {
  it('parses well-formed YAML', () => {
    const path = fixture(`personas:\n  - id: founder\n    name: Solo founder\n`);
    const { data, warnings } = parseYamlFile(path, new BrandReadPolicy(join(path, '..')));
    expect(data).toEqual({ personas: [{ id: 'founder', name: 'Solo founder' }] });
    expect(warnings).toEqual([]);
  });

  it('returns warning + null data on malformed YAML', () => {
    const path = fixture(`personas:\n  - id: founder\n    name: : :\n  bad`);
    const { data, warnings } = parseYamlFile(path, new BrandReadPolicy(join(path, '..')));
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/yaml/i);
  });

  it('returns warning on missing file (does not throw)', () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-yaml-'));
    const { data, warnings } = parseYamlFile(join(root, 'missing.yaml'), new BrandReadPolicy(root));
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/not.*read|not.*found/i);
  });

  it('retains merge-key behavior on the patched YAML parser', () => {
    const path = fixture('defaults: &defaults\n  role: viewer\nuser:\n  <<: *defaults\n  name: Ada\n');
    const { data, warnings } = parseYamlFile(path, new BrandReadPolicy(join(path, '..')));
    expect(data).toEqual({
      defaults: { role: 'viewer' },
      user: { role: 'viewer', name: 'Ada' },
    });
    expect(warnings).toEqual([]);
  });

  it('returns a deterministic warning instead of a cyclic object graph', () => {
    const path = fixture('self: &self\n  value: *self\n');
    const { data, warnings } = parseYamlFile(path, new BrandReadPolicy(join(path, '..')));

    expect(data).toBeNull();
    expect(warnings).toEqual([expect.stringMatching(/Invalid YAML.*aliases form a cycle/)]);
  });
});
