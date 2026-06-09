import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

describe('cloudflare-worker hardcoded version', () => {
  it('matches package.json (bump it per RELEASING.md when releasing)', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
    const source = readFileSync(resolve(root, 'src/adapters/cloudflare-worker.ts'), 'utf-8');
    const match = /version: '([^']+)'/.exec(source);
    expect(match?.[1]).toBe(pkg.version);
  });
});
