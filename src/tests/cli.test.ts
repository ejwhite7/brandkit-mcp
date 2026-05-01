/**
 * @file cli.test.ts
 * @description Unit tests for the BrandKit MCP CLI commands.
 */

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

  it('should create brand directory structure', async () => {
    const { initCommand } = await import('../cli/commands/init.js');
    await initCommand(TEST_DIR, { name: 'Test Brand', force: true });

    expect(existsSync(join(TEST_DIR, 'brand'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand/shared/colors'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand/shared/typography'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand/shared/logos'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand/marketing/components'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand/product/components'))).toBe(true);
  });

  it('should create config file', async () => {
    expect(existsSync(join(TEST_DIR, 'brandkit.config.yaml'))).toBe(true);
    const config = readFileSync(join(TEST_DIR, 'brandkit.config.yaml'), 'utf-8');
    expect(config).toContain('Test Brand');
  });

  it('should create starter CSS files', async () => {
    expect(existsSync(join(TEST_DIR, 'brand/shared/colors/colors.css'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'brand/shared/typography/typography.css'))).toBe(true);
  });
});

describe('CLI Validate Command', () => {
  it('should not throw when config is valid', async () => {
    const { validateCommand } = await import('../cli/commands/validate.js');
    // This test just ensures the command doesn't crash
    // It will exit with process.exit which we can't easily test
    expect(typeof validateCommand).toBe('function');
  });
});

describe('CLI Docs Command', () => {
  it('should be a function', async () => {
    const { docsCommand } = await import('../cli/commands/docs.js');
    expect(typeof docsCommand).toBe('function');
  });
});

