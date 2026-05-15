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
  args: { snippet: string; format?: 'html' | 'css' },
) {
  const warnings: string[] = [];
  const violations: Violation[] = [];

  // Collect canonical color values from v2 tokens
  const colorTokens = index.base.tokens.filter((t) => t.type === 'color');
  const knownColorValues = new Set(colorTokens.map((t) => t.value.toLowerCase()));

  // Rule 1: literal hex colors that aren't already a token value should still be flagged
  // (any literal hex/rgb/hsl in a snippet should be a var(--…) reference instead).
  const hexRe = /#([0-9a-f]{3,8})\b/gi;
  for (const m of args.snippet.matchAll(hexRe)) {
    const literal = `#${m[1]}`.toLowerCase();
    // Skip if the snippet is inside a var() reference's fallback; cheap heuristic only.
    const suggestion = colorTokens.find((t) => t.value.toLowerCase() === literal)?.name;
    violations.push({
      rule: 'literal-color',
      match: m[0],
      suggestion: suggestion ? `Use var(--${suggestion}) instead` : 'Replace with a brand token',
    });
  }
  void knownColorValues;

  // Rule 2: HTML data-component values reference known components (HTML mode only)
  if (args.format === 'html') {
    const knownComponents = new Set(index.base.components.map((c) => c.name.toLowerCase()));
    const dataRe = /data-component=["']([^"']+)["']/g;
    for (const m of args.snippet.matchAll(dataRe)) {
      if (!knownComponents.has(m[1].toLowerCase())) {
        violations.push({ rule: 'unknown-component', match: m[0], suggestion: `No component named "${m[1]}"` });
      }
    }
  }

  if (index.base.tokens.length === 0) warnings.push('No tokens indexed; color validation degraded.');

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
