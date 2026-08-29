import { afterEach, describe, it, expect } from 'vitest';
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BrandKitConfigSchema, BrandkitV1ConfigError } from '../types/config.js';
import { loadConfigFromString, loadConfigWithPath } from '../config/loader.js';

const configTempDirs: string[] = [];

function configTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  configTempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of configTempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

describe('config loader file safety', () => {
  it('rejects symlink, hard-linked, and non-regular config entries', () => {
    const yaml = 'version: 2\nbrand:\n  name: Acme\n';

    const symlinkDir = configTempDir('bk-config-link-');
    writeFileSync(join(symlinkDir, 'target.yaml'), yaml);
    symlinkSync('target.yaml', join(symlinkDir, 'brandkit.config.yaml'));
    expect(() => loadConfigWithPath(join(symlinkDir, 'brandkit.config.yaml'))).toThrow(
      /symbolic-link file/,
    );

    const hardLinkDir = configTempDir('bk-config-hardlink-');
    writeFileSync(join(hardLinkDir, 'target.yaml'), yaml);
    linkSync(join(hardLinkDir, 'target.yaml'), join(hardLinkDir, 'brandkit.config.yaml'));
    expect(() => loadConfigWithPath(join(hardLinkDir, 'brandkit.config.yaml'))).toThrow(
      /hard-linked file/,
    );

    const directoryDir = configTempDir('bk-config-directory-');
    mkdirSync(join(directoryDir, 'brandkit.config.yaml'));
    expect(() => loadConfigWithPath(join(directoryDir, 'brandkit.config.yaml'))).toThrow(
      /non-regular file/,
    );
  });
});
