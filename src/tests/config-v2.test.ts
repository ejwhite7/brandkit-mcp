import { describe, it, expect } from 'vitest';
import { BrandKitConfigSchema, BrandkitV1ConfigError } from '../types/config.js';
import { loadConfigFromString } from '../config/loader.js';

describe('config v2 schema', () => {
  it('accepts a minimal v2 config', () => {
    const parsed = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Acme Corp' },
    });
    expect(parsed.contexts).toEqual(['base', 'web', 'product']);
    expect(parsed.brand.root).toBe('./brand_atomic_system');
    expect(parsed.ignore).toContain('human/');
  });

  it('rejects v1 configs via schema (wrong version literal)', () => {
    expect(() =>
      BrandKitConfigSchema.parse({
        version: '1.0.0',
        brand: { name: 'Old Brand' },
      }),
    ).toThrow();
  });

  it('BrandkitV1ConfigError is a real error class', () => {
    const e = new BrandkitV1ConfigError('test');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('BrandkitV1ConfigError');
  });
});

describe('config loader v1 rejection', () => {
  it('rejects v1 yaml with BrandkitV1ConfigError', () => {
    const yaml = `name: Old Brand\nversion: 1.0.0\npaths:\n  brand: ./brand\n`;
    expect(() => loadConfigFromString(yaml, '/tmp/fake.yaml')).toThrow(BrandkitV1ConfigError);
  });

  it('loads a minimal v2 yaml', () => {
    const yaml = `version: 2\nbrand:\n  name: Acme\n`;
    const cfg = loadConfigFromString(yaml, '/tmp/fake.yaml');
    expect(cfg.brand.name).toBe('Acme');
    expect(cfg.contexts).toEqual(['base', 'web', 'product']);
  });
});
