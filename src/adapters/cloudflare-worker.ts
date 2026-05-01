/**
 * @file adapters/cloudflare-worker.ts
 * @description Cloudflare Workers adapter for BrandKit MCP.
 * Deploys as a Cloudflare Worker with SSE transport.
 *
 * Note: This is a simplified adapter. Full Cloudflare Workers deployment
 * requires bundling the design system data at build time since Workers
 * don't have filesystem access.
 */

export interface Env {
  BRAND_DATA?: string; // JSON-serialized design system data
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        name: 'brandkit-mcp',
        version: '0.1.0',
        description: 'BrandKit MCP server running on Cloudflare Workers',
        endpoints: {
          sse: '/sse',
          messages: '/messages',
          health: '/health',
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', runtime: 'cloudflare-workers' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

