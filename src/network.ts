/** Formats a configured hostname or IP address for use in an HTTP URL. */
export function formatHostForUrl(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}
