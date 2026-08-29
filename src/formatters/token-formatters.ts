/**
 * @file token-formatters.ts
 * @description Output formatters for token specimens (css, scss, tailwind, w3c).
 * Consumed by the get_tokens tool.
 */

import type { TokenSpecimen } from '../types/design-system.js';

/**
 * Create a JSON dictionary without inherited keys or the legacy __proto__
 * setter. Token type and name strings are data, including reserved-looking
 * names such as __proto__, constructor, and prototype.
 */
function createDictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function toCSS(tokens: TokenSpecimen[]): string {
  const lines = tokens.map((t) => `  --${t.name}: ${t.value};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function toSCSS(tokens: TokenSpecimen[]): string {
  return tokens.map((t) => `$${t.name}: ${t.value};`).join('\n') + '\n';
}

export function toTailwind(tokens: TokenSpecimen[]): string {
  const byType = createDictionary<Record<string, string>>();
  for (const t of tokens) {
    byType[t.type] ??= createDictionary<string>();
    byType[t.type][t.name] = t.value;
  }
  return JSON.stringify({ theme: { extend: byType } }, null, 2);
}

export function toW3C(tokens: TokenSpecimen[]): string {
  const out = createDictionary<{ $value: string; $type: string; $description?: string }>();
  for (const t of tokens) {
    out[t.name] = { $value: t.value, $type: t.type, $description: t.role };
  }
  return JSON.stringify(out, null, 2);
}
