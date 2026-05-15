import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '__test_cli__');

describe('CLI Init Command', () => {
  beforeAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates the brand_atomic_system directory and key v2 files', async () => {
    const { initCommand } = await import('../cli/commands/init.js');
    await initCommand(TEST_DIR, { name: 'Test Brand', force: true });

    expect(existsSync(join(TEST_DIR, 'brand_atomic_system'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/magic_trick.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/verbal/positioning.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/verbal/audience.yaml'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/verbal/voice.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/visual/colors_and_type.css'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/visual/components/button.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/visual/tokens/color-primary.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/visual/motion/motion.json'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/visual/motion/motion.css'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/visual/fonts/fonts.yaml'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand_atomic_system/agent/visual/assets/assets.yaml'))).toBe(true);
  });

  it('does NOT create the v1 layout', async () => {
    expect(existsSync(join(TEST_DIR, 'brand/shared'))).toBe(false);
    expect(existsSync(join(TEST_DIR, 'brand/marketing'))).toBe(false);
    expect(existsSync(join(TEST_DIR, 'brand/product'))).toBe(false);
  });

  it('writes a v2 brandkit.config.yaml with the brand name and v2 root', async () => {
    expect(existsSync(join(TEST_DIR, 'brandkit.config.yaml'))).toBe(true);
    const config = readFileSync(join(TEST_DIR, 'brandkit.config.yaml'), 'utf-8');
    expect(config).toContain('version: 2');
    expect(config).toContain('Test Brand');
    expect(config).toContain('brand_atomic_system');
  });
});

describe('CLI Validate Command', () => {
  it('exports a function', async () => {
    const { validateCommand } = await import('../cli/commands/validate.js');
    expect(typeof validateCommand).toBe('function');
  });
});

describe('CLI Docs Command', () => {
  it('exports a function', async () => {
    const { docsCommand } = await import('../cli/commands/docs.js');
    expect(typeof docsCommand).toBe('function');
  });
});
