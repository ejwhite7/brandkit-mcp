import { createHash, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import type { IncomingMessage, Server as HttpServer } from 'http';

/** Conservative defaults for every long-running Node network adapter. */
export const DEFAULT_NETWORK_LIMITS = Object.freeze({
  jsonBodyBytes: 256 * 1024,
  maxConcurrentRequests: 64,
  maxSseSessions: 64,
  requestTimeoutMs: 30_000,
  headersTimeoutMs: 10_000,
  keepAliveTimeoutMs: 5_000,
  maxHeadersCount: 100,
});

export interface NetworkResourceLimits {
  jsonBodyBytes: number;
  maxConcurrentRequests: number;
  maxSseSessions: number;
  requestTimeoutMs: number;
  headersTimeoutMs: number;
  keepAliveTimeoutMs: number;
  maxHeadersCount: number;
}

export function resolveNetworkLimits(
  overrides: Partial<NetworkResourceLimits> = {},
): NetworkResourceLimits {
  const limits = { ...DEFAULT_NETWORK_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`networkLimits.${name} must be a positive integer`);
    }
  }
  if (limits.headersTimeoutMs > limits.requestTimeoutMs) {
    throw new Error('networkLimits.headersTimeoutMs cannot exceed requestTimeoutMs');
  }
  return limits;
}

/** Applies finite socket/parser limits without imposing a lifetime on SSE responses. */
export function configureHttpServerLimits(
  server: HttpServer,
  limits: NetworkResourceLimits,
): void {
  server.requestTimeout = limits.requestTimeoutMs;
  server.headersTimeout = limits.headersTimeoutMs;
  server.keepAliveTimeout = limits.keepAliveTimeoutMs;
  server.maxHeadersCount = limits.maxHeadersCount;
}

export class NetworkRequestTimeoutError extends Error {}
export class NetworkBodyTooLargeError extends Error {}
export class NetworkInvalidJsonError extends Error {}

/** Reads a standalone adapter JSON body without allowing unbounded buffering. */
export function readBoundedJsonBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return Promise.reject(new NetworkBodyTooLargeError('Request body too large'));
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    const cleanup = (): void => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('Request body stream failed'));
    };
    const onAborted = (): void => {
      cleanup();
      reject(new Error('Request body aborted'));
    };
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > maxBytes) {
        cleanup();
        request.pause();
        reject(new NetworkBodyTooLargeError('Request body too large'));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = (): void => {
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch {
        reject(new NetworkInvalidJsonError('Invalid JSON'));
      }
    };
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onAborted);
  });
}

/** Bounds application handler latency; Node's requestTimeout only bounds body receipt. */
export async function withRequestTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new NetworkRequestTimeoutError('Request timed out')), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Formats a configured hostname or IP address for use in an HTTP URL. */
export function formatHostForUrl(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/** Returns whether a configured listen host is restricted to the local machine. */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === '::1' || normalized.startsWith('::1%')) return true;

  if (isIP(normalized) === 4) return normalized.split('.')[0] === '127';

  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized)?.[1];
  return mappedIpv4 !== undefined
    && isIP(mappedIpv4) === 4
    && mappedIpv4.split('.')[0] === '127';
}

function isWildcardHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return normalized === '0.0.0.0' || normalized === '::';
}

function normalizeHostname(value: string, label: string): string {
  if (value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty hostname without surrounding whitespace`);
  }

  let url: URL;
  try {
    url = new URL(`http://${value}`);
  } catch {
    throw new Error(`${label} must be a valid hostname without a port`);
  }

  if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} must be a hostname without a port, path, credentials, query, or fragment`);
  }
  return url.hostname.toLowerCase().replace(/\.$/, '');
}

function normalizeOrigin(value: string, label: string): string {
  if (value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty HTTP(S) origin without surrounding whitespace`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) origin`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || url.origin === 'null'
  ) {
    throw new Error(`${label} must contain only an http(s) scheme, hostname, and optional port`);
  }
  return url.origin.toLowerCase();
}

function singleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}

/** Reads a request header without silently accepting duplicate field lines. */
export function getDistinctRequestHeader(
  request: IncomingMessage,
  name: 'host' | 'origin',
): string | string[] | undefined {
  return request.headersDistinct[name] ?? request.headers[name];
}

export interface SdkDnsRebindingOptions {
  enableDnsRebindingProtection: boolean;
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

export interface NetworkRequestPolicy {
  readonly sdkDnsRebindingOptions: SdkDnsRebindingOptions;
  validate(
    hostHeader: string | string[] | undefined,
    originHeader: string | string[] | undefined,
  ): boolean;
}

/**
 * Creates the Host and Origin policy shared by every Node HTTP MCP transport.
 * Host allowlists contain hostnames (not ports); Origin allowlists are exact origins.
 */
export function createNetworkRequestPolicy(
  listenHost: string,
  listenPort: number,
  configuredAllowedHosts: readonly string[] = [],
  configuredAllowedOrigins: readonly string[] = [],
): NetworkRequestPolicy {
  const allowedHosts = new Set(configuredAllowedHosts.map((host, index) => (
    normalizeHostname(host, `server.allowedHosts[${index}]`)
  )));
  const allowedOrigins = new Set(configuredAllowedOrigins.map((origin, index) => (
    normalizeOrigin(origin, `server.allowedOrigins[${index}]`)
  )));
  const automaticHostTrust = allowedHosts.size === 0;

  if (automaticHostTrust) {
    if (isWildcardHost(listenHost)) {
      throw new Error(
        'server.allowedHosts must contain at least one trusted hostname when server.host is a wildcard address',
      );
    }
    allowedHosts.add(normalizeHostname(formatHostForUrl(listenHost), 'server.host'));
  }

  const sdkHostnames = automaticHostTrust && isLoopbackHost(listenHost)
    ? new Set([...allowedHosts, 'localhost', '127.0.0.1', '[::1]'])
    : allowedHosts;
  // The SDK performs literal Host matching, so include both the portless and
  // direct-listener forms. For ephemeral ports, the shared outer validator is
  // authoritative because the final port is not known when the transport is built.
  const sdkAllowedHosts = listenPort === 0
    ? undefined
    : [...sdkHostnames].flatMap((hostname) => [hostname, `${hostname}:${listenPort}`]);
  const sdkAllowedOrigins = configuredAllowedOrigins.length > 0
    ? [...allowedOrigins]
    : undefined;

  return {
    sdkDnsRebindingOptions: {
      enableDnsRebindingProtection: true,
      allowedHosts: sdkAllowedHosts,
      allowedOrigins: sdkAllowedOrigins,
    },
    validate(hostHeader, originHeader): boolean {
      const host = singleHeaderValue(hostHeader);
      if (host === undefined) return false;

      let hostname: string;
      try {
        const parsed = new URL(`http://${host}`);
        if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
          return false;
        }
        hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
      } catch {
        return false;
      }

      const hostAllowed = automaticHostTrust && isLoopbackHost(listenHost)
        ? isLoopbackHost(hostname)
        : allowedHosts.has(hostname);
      if (!hostAllowed) return false;

      if (originHeader === undefined) return true;
      const origin = singleHeaderValue(originHeader);
      if (origin === undefined) return false;

      let normalizedOrigin: string;
      let originHostname: string;
      try {
        normalizedOrigin = normalizeOrigin(origin, 'Origin header');
        originHostname = new URL(normalizedOrigin).hostname.toLowerCase().replace(/\.$/, '');
      } catch {
        return false;
      }

      if (allowedOrigins.size > 0) return allowedOrigins.has(normalizedOrigin);
      if (automaticHostTrust && isLoopbackHost(listenHost)) return isLoopbackHost(originHostname);
      return allowedHosts.has(originHostname);
    },
  };
}

export interface NetworkAuthPolicy {
  readonly required: boolean;
  authorize(authorizationHeader: string | string[] | undefined): boolean;
}

/**
 * Creates the authentication policy shared by network MCP transports.
 * Loopback listeners retain their unauthenticated development behavior.
 */
export function createNetworkAuthPolicy(host: string, injectedToken?: string): NetworkAuthPolicy {
  const required = !isLoopbackHost(host);
  const token = injectedToken ?? process.env.BRANDKIT_AUTH_TOKEN;

  if (required && (!token || /\s/.test(token))) {
    throw new Error(
      'BRANDKIT_AUTH_TOKEN must be set to a non-whitespace Bearer token for non-loopback network hosts',
    );
  }

  const expectedDigest = token === undefined
    ? undefined
    : createHash('sha256').update(token).digest();

  return {
    required,
    authorize(authorizationHeader): boolean {
      if (!required) return true;
      const header = Array.isArray(authorizationHeader)
        ? authorizationHeader.length === 1 ? authorizationHeader[0] : undefined
        : authorizationHeader;
      const candidate = typeof header === 'string'
        ? /^Bearer ([^\s]+)$/i.exec(header)?.[1]
        : undefined;
      if (candidate === undefined || expectedDigest === undefined) return false;

      const candidateDigest = createHash('sha256').update(candidate).digest();
      return timingSafeEqual(candidateDigest, expectedDigest);
    },
  };
}
