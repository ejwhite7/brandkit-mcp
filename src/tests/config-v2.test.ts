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
    expect(parsed.server).toEqual({
      transport: 'stdio',
      port: 3001,
      host: '127.0.0.1',
      allowedHosts: [],
      allowedOrigins: [],
    });
    expect(parsed.preview).toEqual({ port: 3000, host: '127.0.0.1' });
  });

  it('accepts explicit network trust configuration', () => {
    const parsed = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Acme Corp' },
      server: {
        allowedHosts: ['mcp.example.com'],
        allowedOrigins: ['https://admin.example.com'],
      },
    });
    expect(parsed.server.allowedHosts).toEqual(['mcp.example.com']);
    expect(parsed.server.allowedOrigins).toEqual(['https://admin.example.com']);
  });

  it('accepts Streamable HTTP and explicit network hosts', () => {
    const parsed = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Acme Corp' },
      server: { transport: 'http', host: '::1' },
      preview: { host: '::1' },
    });
    expect(parsed.server.transport).toBe('http');
    expect(parsed.server.host).toBe('::1');
    expect(parsed.preview.host).toBe('::1');
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

  it('throws BrandkitV1ConfigError when version is missing entirely', () => {
    const yaml = `brand:\n  name: Acme\n`;
    expect(() => loadConfigFromString(yaml, '/tmp/fake.yaml')).toThrow(BrandkitV1ConfigError);
  });

  it('throws BrandkitV1ConfigError on a non-2 version', () => {
    const yaml = `version: 3\nbrand:\n  name: Acme\n`;
    expect(() => loadConfigFromString(yaml, '/tmp/fake.yaml')).toThrow(BrandkitV1ConfigError);
  });
});
