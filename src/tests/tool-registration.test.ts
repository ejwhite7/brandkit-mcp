import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { lstatSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { allowWriteToolsForTransport } from '../index.js';
import { registerAllTools } from '../tools/index.js';
import type { SyncContext } from '../tools/sync-brand-docs.js';
import { buildFixtureIndex } from './helpers.js';

interface HandlerResult {
  tools?: Array<{ name: string }>;
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

type RequestHandler = (request?: {
  params: { name: string; arguments?: Record<string, unknown> };
}) => Promise<HandlerResult>;

function captureToolHandlers(options: {
  allowWriteTools?: boolean;
  withContext?: boolean;
  context?: SyncContext;
} = {}) {
  const handlers: RequestHandler[] = [];
  const fakeServer = {
    setRequestHandler: (_schema: unknown, handler: RequestHandler) => handlers.push(handler),
  } as unknown as Server;
  const index = buildFixtureIndex('v2/full');
  const dir = mkdtempSync(join(tmpdir(), 'bk-tool-registration-'));
  tempDirs.push(dir);
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(configPath, 'version: 2\nbrand:\n  name: Test\n  root: ./\n');
  const configEntry = lstatSync(configPath);

  const context = options.context ?? {
    configPath,
    outputDir: dir,
    configIdentity: { dev: configEntry.dev, ino: configEntry.ino },
  };
  registerAllTools(
    fakeServer,
    () => index,
    options.withContext || options.context ? context : undefined,
    { allowWriteTools: options.allowWriteTools },
  );

  return { listTools: handlers[0], callTool: handlers[1] };
}

describe('write-capable tool registration', () => {
  it('hides and refuses sync_brand_docs by default', async () => {
    const { listTools, callTool } = captureToolHandlers({ withContext: true });
    const listed = await listTools();
    expect(listed.tools?.map((tool) => tool.name)).not.toContain('sync_brand_docs');

    const called = await callTool({ params: { name: 'sync_brand_docs', arguments: {} } });
    expect(called.isError).toBe(true);
    expect(called.content?.[0].text).toContain('Unknown tool: sync_brand_docs');

    const overview = await callTool({ params: { name: 'get_brand_overview' } });
    const payload = JSON.parse(overview.content?.[0].text ?? '{}') as {
      availableTools: Array<{ name: string }>;
    };
    expect(payload.availableTools.map((tool) => tool.name)).not.toContain('sync_brand_docs');
  });

  it('lists and dispatches sync_brand_docs only with privilege and write context', async () => {
    const { listTools, callTool } = captureToolHandlers({
      allowWriteTools: true,
      withContext: true,
    });
    const listed = await listTools();
    expect(listed.tools?.map((tool) => tool.name)).toContain('sync_brand_docs');

    const called = await callTool({ params: { name: 'sync_brand_docs', arguments: {} } });
    expect(called.isError).not.toBe(true);
    expect(JSON.parse(called.content?.[0].text ?? '{}').status).toBe('needs_answers');

    const overview = await callTool({ params: { name: 'get_brand_overview' } });
    const payload = JSON.parse(overview.content?.[0].text ?? '{}') as {
      availableTools: Array<{ name: string }>;
    };
    expect(payload.availableTools.map((tool) => tool.name)).toContain('sync_brand_docs');
  });

  it('stays read-only without a writable context even when privilege is requested', async () => {
    const { listTools, callTool } = captureToolHandlers({ allowWriteTools: true });
    expect((await listTools()).tools?.map((tool) => tool.name)).not.toContain('sync_brand_docs');
    expect((await callTool({ params: { name: 'sync_brand_docs' } })).isError).toBe(true);
  });

  it('shares updated config identity across fresh privileged server registrations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-tool-registration-shared-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'brandkit.config.yaml');
    writeFileSync(configPath, 'version: 2\nbrand:\n  name: Test\n  root: ./\n');
    const entry = lstatSync(configPath);
    const context: SyncContext = {
      configPath,
      outputDir: dir,
      configIdentity: { dev: entry.dev, ino: entry.ino },
    };
    const args = {
      audience: 'a',
      voiceWords: 'b',
      visualReferences: 'c',
      antiReferences: 'd',
    };

    const firstServer = captureToolHandlers({ allowWriteTools: true, context });
    const first = await firstServer.callTool({ params: { name: 'sync_brand_docs', arguments: args } });
    expect(JSON.parse(first.content?.[0].text ?? '{}').savedConfig).toBe(true);

    const secondServer = captureToolHandlers({ allowWriteTools: true, context });
    const second = await secondServer.callTool({
      params: { name: 'sync_brand_docs', arguments: { ...args, audience: 'updated' } },
    });
    expect(JSON.parse(second.content?.[0].text ?? '{}').savedConfig).toBe(true);
  });
});

describe('startServer write-tool transport policy', () => {
  it('keeps stdio writable and requires explicit privilege on network transports', () => {
    expect(allowWriteToolsForTransport('stdio')).toBe(true);
    expect(allowWriteToolsForTransport('sse')).toBe(false);
    expect(allowWriteToolsForTransport('http')).toBe(false);
    expect(allowWriteToolsForTransport('sse', true)).toBe(true);
    expect(allowWriteToolsForTransport('http', true)).toBe(true);
  });
});
