/**
 * @file scss.ts
 * @description Transforms design tokens into SCSS variables format.
 */

import type { DesignColor, DesignTypographyItem } from '../types/design-system.js';

/**
 * Converts colors to SCSS variable declarations.
 * @param colors - Array of design colors
 * @returns SCSS string with variable declarations
 */
export function colorsToSCSSFormat(colors: DesignColor[]): string {
  if (colors.length === 0) return '// No colors defined';
  return colors
    .map((c) => {
      const varName = c.token.replace(/^--/, '$');
      return `${varName}: ${c.value};`;
    })
    .join('\n');
}

/**
 * Converts typography items to SCSS variable declarations.
 * @param typography - Array of typography items
 * @returns SCSS string with variable declarations
 */
export function typographyToSCSSFormat(typography: DesignTypographyItem[]): string {
  if (typography.length === 0) return '// No typography tokens defined';
  const lines: string[] = [];
  for (const t of typography) {
    if (t.token) {
      const varName = t.token.replace(/^--/, '$');
      const value = t.fontFamily ?? t.fontSize ?? t.fontWeight?.toString() ?? t.lineHeight ?? '';
      if (value) lines.push(`${varName}: ${value};`);
    }
  }
  return lines.join('\n') || '// No typography tokens defined';
}

/**
 * Converts both colors and typography to SCSS format.
 */
export function toSCSSFormat(colors: DesignColor[], typography: DesignTypographyItem[]): string {
  const parts: string[] = [];
  if (colors.length > 0) {
    parts.push('// Colors');
    parts.push(colorsToSCSSFormat(colors));
  }
  if (typography.length > 0) {
    parts.push('\n// Typography');
    parts.push(typographyToSCSSFormat(typography));
  }
  return parts.join('\n') || '// No design tokens defined';
}

