/**
 * @file validate-usage.ts
 * @description MCP tool: validate_usage
 * Validates whether an HTML/CSS snippet uses brand tokens rather than literal
 * values, and references known components.
 */

import type { DesignSystemIndex } from '../indexer/types.js';

export const TOOL_NAME = 'validate_usage';

export const TOOL_DESCRIPTION =
  'Validate that an HTML/CSS snippet uses brand tokens (rather than literal values) and references known components.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    snippet: { type: 'string', description: 'HTML or CSS snippet to validate' },
    format: { type: 'string', enum: ['html', 'css'], default: 'css' },
  },
  required: ['snippet'],
};

interface Violation { rule: string; match: string; suggestion?: string }

export function handler(
  index: DesignSystemIndex,
  args: { snippet?: unknown; format?: 'html' | 'css' },
) {
  if (typeof args.snippet !== 'string') {
    return [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { violations: [], _warnings: ['Missing or invalid required "snippet" argument'] },
          null,
          2,
        ),
      },
    ];
  }

  const warnings: string[] = [];
  const violations: Violation[] = [];

  // Collect canonical color values from v2 tokens
  const colorTokens = index.contexts.base.tokens.filter((t) => t.type === 'color');
  const knownColorValues = new Set(colorTokens.map((t) => t.value.toLowerCase()));

  // Rule 1: flag literal hex colors that do not correspond to a known canonical token value.
  // If the hex IS a canonical token value, skip the violation (the author used the right
  // value but may not know the token name — not an error).
  const hexRe = /#([0-9a-f]{3,8})\b/gi;
  for (const m of args.snippet.matchAll(hexRe)) {
    const literal = `#${m[1]}`.toLowerCase();
    if (knownColorValues.has(literal)) {
      // Canonical value — not a violation.
      continue;
    }
    violations.push({
      rule: 'literal-color',
      match: m[0],
      suggestion: 'Replace with a brand token',
    });
  }

  // Rule 2: HTML data-component values reference known components (HTML mode only)
  if (args.format === 'html') {
    const knownComponents = new Set(index.contexts.base.components.map((c) => c.name.toLowerCase()));
    const dataRe = /data-component=["']([^"']+)["']/g;
    for (const m of args.snippet.matchAll(dataRe)) {
      if (!knownComponents.has(m[1].toLowerCase())) {
        violations.push({ rule: 'unknown-component', match: m[0], suggestion: `No component named "${m[1]}"` });
      }
    }
  }

  if (index.contexts.base.tokens.length === 0) warnings.push('No tokens indexed; color validation degraded.');

  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        { violations, _warnings: warnings },
        null,
        2,
      ),
    },
  ];
}
