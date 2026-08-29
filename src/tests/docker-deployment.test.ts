import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { BrandKitConfigSchema } from '../types/config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('Docker deployment contract', () => {
  it('builds deterministically and runs the main Streamable HTTP CLI as a non-root user', () => {
    const dockerfile = read('Dockerfile');

    expect(dockerfile).toContain('COPY package.json package-lock.json');
    expect(dockerfile.match(/RUN npm ci/g)).toHaveLength(2);
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('ENV BRANDKIT_CONFIG=/app/docker/brandkit.config.yaml');
    expect(dockerfile).toContain('"serve", "--transport", "http"');
    expect(dockerfile).toContain('"--host", "0.0.0.0"');
  });

  it('requires runtime auth, checks authenticated health, and has no default bind mounts', () => {
    const compose = read('docker-compose.yml');

    expect(compose).toContain('BRANDKIT_AUTH_TOKEN: ${BRANDKIT_AUTH_TOKEN:?');
    expect(compose).toContain("Authorization:'Bearer '+process.env.BRANDKIT_AUTH_TOKEN");
    expect(compose).toContain('127.0.0.1:${BRANDKIT_PORT:-3001}:3001');
    expect(compose).not.toMatch(/^\s+volumes:/m);
    expect(compose).not.toContain('preview:');
  });

  it('ships a valid wildcard-listener config with explicit trusted hosts', () => {
    const config = BrandKitConfigSchema.parse(yaml.load(read('docker/brandkit.config.yaml')));

    expect(config.server).toMatchObject({ transport: 'http', host: '0.0.0.0', port: 3001 });
    expect(config.server.allowedHosts).toEqual(expect.arrayContaining([
      '127.0.0.1',
      'localhost',
      'brandkit-mcp',
    ]));
  });

  it('CI runs the real MCP client smoke with bounded Compose startup and cleanup', () => {
    const workflow = read('.github/workflows/ci.yml');
    const smokeClient = read('scripts/docker-smoke.mjs');

    expect(workflow).toContain('docker compose up --detach --wait --wait-timeout 60');
    expect(workflow).toContain('trap cleanup EXIT');
    expect(workflow).toContain('npm run test:docker-smoke');
    expect(smokeClient).toContain('new StreamableHTTPClientTransport');
    expect(smokeClient).toContain("client.callTool({ name: 'get_brand_overview'");
    expect(smokeClient).not.toContain('console.log(token)');
  });
});
