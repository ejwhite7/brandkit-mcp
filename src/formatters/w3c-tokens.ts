/**
 * @file w3c-tokens.ts
 * @description Transforms design tokens into W3C Design Tokens Community Group format (DTCG).
 * @see https://design-tokens.github.io/community-group/format/
 */

import type { DesignColor, DesignTypographyItem } from '../types/design-system.js';

/**
 * Converts colors to W3C Design Tokens format.
 * @param colors - Array of design colors
 * @returns W3C Design Tokens JSON string
 */
export function colorsToW3CFormat(colors: DesignColor[]): string {
  const tokens: Record<string, unknown> = {};

  for (const c of colors) {
    const key = c.token.replace(/^--/, '').replace(/-/g, '.');
    setNestedValue(tokens, key, {
      $value: c.hex ?? c.value,
      $type: 'color',
      $description: c.usage ?? `${c.name} color token`,
    });
  }

  return JSON.stringify(tokens, null, 2);
}

/**
 * Converts typography to W3C Design Tokens format.
 * @param typography - Array of typography items
 * @returns W3C Design Tokens JSON string
 */
export function typographyToW3CFormat(typography: DesignTypographyItem[]): string {
  const tokens: Record<string, unknown> = {};

  for (const t of typography) {
    if (!t.token) continue;
    const key = t.token.replace(/^--/, '').replace(/-/g, '.');

    if (t.fontFamily) {
      setNestedValue(tokens, key, {
        $value: t.fontFamily,
        $type: 'fontFamily',
        $description: t.usage ?? `${t.name} font family`,
      });
    } else if (t.fontSize) {
      setNestedValue(tokens, key, {
        $value: t.fontSize,
        $type: 'dimension',
        $description: t.usage ?? `${t.name} font size`,
      });
    } else if (t.fontWeight) {
      setNestedValue(tokens, key, {
        $value: t.fontWeight,
        $type: 'fontWeight',
        $description: t.usage ?? `${t.name} font weight`,
      });
    }
  }

  return JSON.stringify(tokens, null, 2);
}

/**
 * Converts all tokens to W3C format.
 */
export function toW3CFormat(colors: DesignColor[], typography: DesignTypographyItem[]): string {
  const colorTokens = JSON.parse(colorsToW3CFormat(colors));
  const typoTokens = JSON.parse(typographyToW3CFormat(typography));
  return JSON.stringify({ ...colorTokens, ...typoTokens }, null, 2);
}

/**
 * Sets a nested value in an object using dot-notation key.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

