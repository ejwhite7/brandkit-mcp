/**
 * @file _context.ts
 * @description Runtime coercion for the `context` tool argument.
 * The MCP SDK does not enforce inputSchema enums at runtime, so tools must
 * tolerate out-of-enum values per the tolerance principle: fall back to
 * 'base' and record a warning instead of throwing.
 */

import type { BrandContext } from '../types/design-system.js';

const CONTEXTS = ['base', 'web', 'product'] as const;

export function coerceContext(value: unknown, warnings: string[]): BrandContext {
  if (value === undefined || value === null) return 'base';
  if (typeof value === 'string' && (CONTEXTS as readonly string[]).includes(value)) {
    return value as BrandContext;
  }
  warnings.push(`Unknown context "${String(value)}"; falling back to "base"`);
  return 'base';
}
