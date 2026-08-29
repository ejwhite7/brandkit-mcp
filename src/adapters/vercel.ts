/**
 * Stateless Vercel Functions adapter for Streamable HTTP MCP.
 *
 * The design-system index is immutable deployment data and may be reused by a
 * warm function. Protocol state is never reused: every invocation gets a new
 * MCP Server and transport and is closed before the invocation completes.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { dirname, resolve } from 'path';
import { loadConfigWithPath, resolveConfigPaths } from '../config/loader.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import type { DesignSystemIndex } from '../indexer/types.js';
import {
  DEFAULT_NETWORK_LIMITS,
  NetworkBodyTooLargeError,
  NetworkInvalidJsonError,
  NetworkRequestTimeoutError,
  type NetworkAuthPolicy,
  type NetworkRequestPolicy,
  createNetworkAuthPolicy,
  createNetworkRequestPolicy,
  getDistinctRequestHeader,
  readBoundedJsonBody,
  withRequestTimeout,
} from '../network.js';
import { registerAllTools } from '../tools/index.js';
import { getPackageVersion } from '../version.js';

type VercelRequest = IncomingMessage & { body?: unknown };
type VercelResponse = ServerResponse;

const DEFAULT_CONFIG_PATH = 'templates/starter/brandkit.config.yaml';
let indexPromise: Promise<DesignSystemIndex> | undefined;

function loadReadOnlyIndex(): Promise<DesignSystemIndex> {
  indexPromise ??= (async () => {
    const configPath = resolve(process.env.BRANDKIT_CONFIG ?? DEFAULT_CONFIG_PATH);
    const { config: rawConfig, filePath } = loadConfigWithPath(configPath);
    const config = resolveConfigPaths(rawConfig, dirname(filePath));
    return buildDesignSystemIndex(config);
  })();
  return indexPromise;
}

function deploymentHosts(): string[] {
  const configured = (process.env.BRANDKIT_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  for (const value of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (value) configured.push(value.trim());
  }
  return [...new Set(configured)];
}

function requestPort(request: VercelRequest): number {
  const rawHost = getDistinctRequestHeader(request, 'host');
  const host = Array.isArray(rawHost) && rawHost.length === 1 ? rawHost[0] : rawHost;
  if (typeof host !== 'string') return 443;
  try {
    const port = new URL(`http://${host}`).port;
    return port === '' ? 443 : Number(port);
  } catch {
    return 443;
  }
}

function requestId(body: unknown): string | number | null {
  if (typeof body !== 'object' || body === null || !('id' in body)) return null;
  const id = body.id;
  return typeof id === 'string' || typeof id === 'number' || id === null ? id : null;
}

function sendJson(
  response: VercelResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sendRpcError(
  response: VercelResponse,
  status: number,
  code: number,
  message: string,
  id: string | number | null = null,
  headers: Record<string, string> = {},
): void {
  sendJson(response, status, { jsonrpc: '2.0', error: { code, message }, id }, headers);
}

async function parsedBody(request: VercelRequest): Promise<unknown> {
  if (request.body === undefined) {
    return readBoundedJsonBody(request, DEFAULT_NETWORK_LIMITS.jsonBodyBytes);
  }

  const raw = Buffer.isBuffer(request.body)
    ? request.body
    : typeof request.body === 'string'
      ? Buffer.from(request.body)
      : Buffer.from(JSON.stringify(request.body));
  if (raw.byteLength > DEFAULT_NETWORK_LIMITS.jsonBodyBytes) {
    throw new NetworkBodyTooLargeError('Request body too large');
  }
  if (Buffer.isBuffer(request.body) || typeof request.body === 'string') {
    try {
      return JSON.parse(raw.toString('utf8')) as unknown;
    } catch {
      throw new NetworkInvalidJsonError('Invalid JSON');
    }
  }
  return request.body;
}

/** Default Vercel Node.js Function entry point. */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  let authPolicy: NetworkAuthPolicy;
  let requestPolicy: NetworkRequestPolicy;
  try {
    authPolicy = createNetworkAuthPolicy('0.0.0.0');
    requestPolicy = createNetworkRequestPolicy('0.0.0.0', requestPort(request), deploymentHosts());
  } catch {
    console.error('[brandkit-mcp] Vercel deployment configuration error');
    sendJson(response, 503, {
      error: 'Service unavailable',
      code: 'deployment_not_configured',
    });
    return;
  }

  if (!requestPolicy.validate(
    getDistinctRequestHeader(request, 'host'),
    getDistinctRequestHeader(request, 'origin'),
  )) {
    sendJson(response, 403, { error: 'Forbidden', code: 'forbidden' });
    return;
  }
  if (!authPolicy.authorize(request.headers.authorization)) {
    sendJson(response, 401, { error: 'Unauthorized', code: 'unauthorized' }, {
      'WWW-Authenticate': 'Bearer',
    });
    return;
  }
  if (request.method !== 'POST') {
    sendRpcError(response, 405, -32000, 'Method not allowed.', null, { Allow: 'POST' });
    return;
  }

  let body: unknown;
  try {
    body = await parsedBody(request);
  } catch (error) {
    const tooLarge = error instanceof NetworkBodyTooLargeError;
    sendRpcError(response, tooLarge ? 413 : 400, tooLarge ? -32001 : -32700,
      tooLarge ? 'Request body too large' : 'Parse error');
    return;
  }

  let index: DesignSystemIndex;
  try {
    index = await loadReadOnlyIndex();
  } catch {
    console.error('[brandkit-mcp] Vercel brand data initialization error');
    sendRpcError(response, 503, -32004, 'Brand data unavailable', requestId(body));
    return;
  }

  const server = new Server(
    { name: 'brandkit-mcp', version: getPackageVersion() },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );
  registerAllTools(server, () => index);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    ...requestPolicy.sdkDnsRebindingOptions,
  });

  try {
    await server.connect(transport);
    await withRequestTimeout(
      transport.handleRequest(request, response, body),
      DEFAULT_NETWORK_LIMITS.requestTimeoutMs,
    );
  } catch (error) {
    console.error('[brandkit-mcp] Vercel MCP request error');
    if (!response.headersSent) {
      const timedOut = error instanceof NetworkRequestTimeoutError;
      sendRpcError(
        response,
        timedOut ? 504 : 500,
        timedOut ? -32003 : -32603,
        timedOut ? 'Request timed out' : 'Internal server error',
        requestId(body),
      );
    } else if (!response.writableEnded) {
      response.end();
    }
  } finally {
    await server.close().catch(() => {
      console.error('[brandkit-mcp] Vercel request cleanup error');
    });
  }
}
