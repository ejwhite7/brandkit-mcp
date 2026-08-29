import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Stubs for heavy dependencies so we can exercise the adapter in isolation.
// ---------------------------------------------------------------------------

const handlePostMessageSpy = vi.fn().mockResolvedValue(undefined);
const capturedSessionId = 'test-session-id';
const registerAllToolsSpy = vi.hoisted(() => vi.fn());

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => {
  return {
    SSEServerTransport: class {
      sessionId = capturedSessionId;
      start = vi.fn().mockResolvedValue(undefined);
      handlePostMessage = handlePostMessageSpy;
    },
  };
});

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: class {
      connect = vi.fn().mockResolvedValue(undefined);
    },
  };
});

vi.mock('../config/loader.js', () => ({
  loadConfigWithPath: () => ({
    config: { version: 2, brand: { name: 'Test', root: '/fake' } },
    filePath: '/fake/brandkit.config.yaml',
  }),
  resolveConfigPaths: (_cfg: unknown, _dir: string) => ({
    version: 2,
    brand: { name: 'Test', root: '/fake' },
  }),
}));

vi.mock('../indexer/index.js', () => ({
  buildDesignSystemIndex: vi.fn().mockResolvedValue({}),
}));

vi.mock('../tools/index.js', () => ({
  registerAllTools: registerAllToolsSpy,
}));

// Must be imported AFTER mocks are declared so vi.mock hoisting applies.
const { handleSSE, handleMessages } = await import('../adapters/vercel.js');

// ---------------------------------------------------------------------------

describe('vercel adapter handleMessages', () => {
  it('responds 400 instead of hanging when no SSE session exists', async () => {
    let status: number | undefined;
    let body: string | undefined;
    const req = { url: '/api/messages?sessionId=missing', method: 'POST' };
    const res = {
      writeHead: (s: number) => {
        status = s;
      },
      end: (b: string) => {
        body = b;
      },
    };
    await handleMessages(req, res);
    expect(status).toBe(400);
    expect(JSON.parse(body ?? '{}').error).toContain('No active SSE session');
  });
});

describe('vercel adapter handleSSE + handleMessages body forwarding', () => {
  beforeEach(() => {
    handlePostMessageSpy.mockClear();
    registerAllToolsSpy.mockClear();
  });

  it('registers a context-free read-only tool surface', async () => {
    const sseRes = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    await handleSSE({}, sseRes);

    expect(registerAllToolsSpy).toHaveBeenCalledOnce();
    expect(registerAllToolsSpy.mock.calls[0][2]).toBeUndefined();
    expect(registerAllToolsSpy.mock.calls[0][3]).toBeUndefined();
  });

  it('forwards the pre-parsed req.body to handlePostMessage', async () => {
    // 1. Establish a fake SSE session via handleSSE.
    const sseRes = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    await handleSSE({}, sseRes);

    // 2. POST a message with a pre-parsed body on req.body.
    const parsedBody = { jsonrpc: '2.0', id: 1, method: 'ping' };
    const postReq = {
      url: `/api/messages?sessionId=${capturedSessionId}`,
      method: 'POST',
      body: parsedBody,
    };
    const postRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    await handleMessages(postReq, postRes);

    // 3. handlePostMessage must have been called with req.body as the third arg.
    expect(handlePostMessageSpy).toHaveBeenCalledOnce();
    const [, , forwardedBody] = handlePostMessageSpy.mock.calls[0];
    expect(forwardedBody).toBe(parsedBody);
  });
});
