/**
 * @file get-tokens.ts
 * @description MCP tool: get_tokens
 * Returns design tokens from agent/visual/tokens/ specimens.
 * Supports output formats: json, css, scss, tailwind, w3c.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext, TokenSpecimen } from '../types/design-system.js';
import { coerceContext } from './_context.js';

export const TOOL_NAME = 'get_tokens';

export const TOOL_DESCRIPTION =
  'Return design tokens from agent/visual/tokens/ specimens. Optional context (base|web|product) and output format (json|css|scss|tailwind|w3c).';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
    format: {
      type: 'string',
      enum: ['json', 'css', 'scss', 'tailwind', 'w3c'],
      default: 'json',
    },
    type: { type: 'string', description: 'Filter by token type (color, font, radius, spacing, etc.)' },
  },
};

function toCSS(tokens: TokenSpecimen[]): string {
  const lines = tokens.map((t) => `  --${t.name}: ${t.value};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

function toSCSS(tokens: TokenSpecimen[]): string {
  return tokens.map((t) => `$${t.name}: ${t.value};`).join('\n') + '\n';
}

function toTailwind(tokens: TokenSpecimen[]): string {
  const byType: Record<string, Record<string, string>> = {};
  for (const t of tokens) {
    byType[t.type] ??= {};
    byType[t.type][t.name] = t.value;
  }
  return JSON.stringify({ theme: { extend: byType } }, null, 2);
}

function toW3C(tokens: TokenSpecimen[]): string {
  const out: Record<string, { $value: string; $type: string; $description?: string }> = {};
  for (const t of tokens) {
    out[t.name] = { $value: t.value, $type: t.type, $description: t.role };
  }
  return JSON.stringify(out, null, 2);
}

/**
 * Handles the get_tokens tool call.
 */
export function handler(
  index: DesignSystemIndex,
  args: {
    context?: BrandContext;
    format?: 'json' | 'css' | 'scss' | 'tailwind' | 'w3c';
    type?: string;
  },
) {
  const warnings: string[] = [];
  const ctx = coerceContext(args.context, warnings);
  const format = args.format ?? 'json';

  let tokens = index[ctx].tokens.length ? index[ctx].tokens : index.base.tokens;
  if (args.type) {
    tokens = tokens.filter((t) => t.type === args.type);
  }
  if (tokens.length === 0) warnings.push('No token specimens found');

  let text: string;
  switch (format) {
    case 'css':
      text = toCSS(tokens);
      break;
    case 'scss':
      text = toSCSS(tokens);
      break;
    case 'tailwind':
      text = toTailwind(tokens);
      break;
    case 'w3c':
      text = toW3C(tokens);
      break;
    default:
      text = JSON.stringify({ context: ctx, tokens, _warnings: warnings }, null, 2);
  }

  // Surface warnings in a format-appropriate way: a comment for text formats,
  // an embedded _warnings key for JSON-document formats (tailwind, w3c).
  if (warnings.length > 0) {
    if (format === 'css' || format === 'scss') {
      text = `/* warnings: ${warnings.join('; ')} */\n${text}`;
    } else if (format === 'tailwind' || format === 'w3c') {
      text = JSON.stringify(
        { ...(JSON.parse(text) as Record<string, unknown>), _warnings: warnings },
        null,
        2,
      );
    }
    // format === 'json' already embeds _warnings in its payload.
  }

  return [{ type: 'text' as const, text }];
}

