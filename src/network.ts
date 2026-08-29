import { createHash, timingSafeEqual } from 'crypto';
import { isIP } from 'net';

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
