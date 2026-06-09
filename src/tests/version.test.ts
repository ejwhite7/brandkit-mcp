import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPackageVersion } from '../version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('getPackageVersion', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
    expect(getPackageVersion()).toBe(pkg.version);
  });
});
