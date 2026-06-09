import { describe, it, expect } from 'vitest';
import { handleMessages } from '../adapters/vercel.js';

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
