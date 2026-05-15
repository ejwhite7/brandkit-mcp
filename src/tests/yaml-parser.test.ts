import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseYamlFile } from '../parsers/yaml-parser.js';

function fixture(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-yaml-'));
  const path = join(dir, 'fixture.yaml');
  writeFileSync(path, content);
  return path;
}

describe('parseYamlFile', () => {
  it('parses well-formed YAML', () => {
    const path = fixture(`personas:\n  - id: founder\n    name: Solo founder\n`);
    const { data, warnings } = parseYamlFile(path);
    expect(data).toEqual({ personas: [{ id: 'founder', name: 'Solo founder' }] });
    expect(warnings).toEqual([]);
  });

  it('returns warning + null data on malformed YAML', () => {
    const path = fixture(`personas:\n  - id: founder\n    name: : :\n  bad`);
    const { data, warnings } = parseYamlFile(path);
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/yaml/i);
  });

  it('returns warning on missing file (does not throw)', () => {
    const { data, warnings } = parseYamlFile('/nonexistent/path.yaml');
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/not.*read|not.*found/i);
  });
});
