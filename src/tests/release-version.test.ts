import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('release version', () => {
  it('matches between the npm package and MCP registry metadata', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      version: string;
    };
    const server = JSON.parse(readFileSync(resolve(root, 'server.json'), 'utf-8')) as {
      version: string;
      packages: Array<{ version: string }>;
    };

    expect(server.version).toBe(pkg.version);
    expect(server.packages.map((entry) => entry.version)).toEqual([pkg.version]);
  });
});
