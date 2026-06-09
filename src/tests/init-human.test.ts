import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initCommand } from '../cli/commands/init.js';

describe('init scaffolds human/', () => {
  it('creates the human/ drop zone with a readme', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-init-'));
    await initCommand(dir, { name: 'Scaffold Test' });
    const readmePath = join(dir, 'brand_atomic_system', 'human', 'readme.md');
    expect(existsSync(readmePath)).toBe(true);
    expect(readFileSync(readmePath, 'utf-8')).toContain('ignores this directory');
  });
});
