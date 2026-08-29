import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const token = process.env.BRANDKIT_AUTH_TOKEN;
if (!token) {
  console.error('BRANDKIT_AUTH_TOKEN is required for the Docker smoke test');
  process.exit(1);
}

const endpoint = new URL(process.env.BRANDKIT_MCP_URL ?? 'http://127.0.0.1:3001/mcp');
const client = new Client({ name: 'brandkit-docker-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const timeoutMs = 30_000;
let timeout;

try {
  await Promise.race([
    (async () => {
      await client.connect(transport);
      const tools = await client.listTools();
      if (!tools.tools.some(({ name }) => name === 'get_brand_overview')) {
        throw new Error('get_brand_overview was not advertised');
      }
      if (tools.tools.some(({ name }) => name === 'sync_brand_docs')) {
        throw new Error('network write tool was unexpectedly advertised');
      }

      const result = await client.callTool({ name: 'get_brand_overview', arguments: {} });
      if (result.isError || result.content.length === 0) {
        throw new Error('get_brand_overview did not return content');
      }
    })(),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`MCP smoke test timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
  console.log('Docker MCP initialize and get_brand_overview call succeeded');
} finally {
  if (timeout) clearTimeout(timeout);
  await client.close().catch(() => {});
}
