/**
 * @file css.ts
 * @description Transforms design tokens into CSS custom properties format.
 */

import type { DesignColor, DesignTypographyItem } from '../types/design-system.js';

/**
 * Converts an array of colors to a CSS `:root` block with custom properties.
 * @param colors - Array of design colors
 * @returns CSS string with custom properties
 */
export function colorsToCSSFormat(colors: DesignColor[]): string {
  if (colors.length === 0) return '/* No colors defined */';
  const lines = colors.map((c) => `  ${c.token}: ${c.value};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/**
 * Converts an array of typography items to a CSS `:root` block.
 * @param typography - Array of typography items
 * @returns CSS string with typography custom properties
 */
export function typographyToCSSFormat(typography: DesignTypographyItem[]): string {
  if (typography.length === 0) return '/* No typography tokens defined */';
  const lines: string[] = [];
  for (const t of typography) {
    if (t.token) {
      const value = t.fontFamily ?? t.fontSize ?? t.fontWeight?.toString() ?? t.lineHeight ?? '';
      if (value) lines.push(`  ${t.token}: ${value};`);
    }
  }
  if (lines.length === 0) return '/* No typography tokens defined */';
  return `:root {\n${lines.join('\n')}\n}`;
}

/**
 * Converts both colors and typography to a combined CSS output.
 * @param colors - Array of design colors
 * @param typography - Array of typography items
 * @returns Combined CSS custom properties string
 */
export function toCSSFormat(colors: DesignColor[], typography: DesignTypographyItem[]): string {
  const parts: string[] = [];
  if (colors.length > 0) {
    parts.push('/* Colors */');
    parts.push(colorsToCSSFormat(colors));
  }
  if (typography.length > 0) {
    parts.push('\n/* Typography */');
    parts.push(typographyToCSSFormat(typography));
  }
  return parts.join('\n') || '/* No design tokens defined */';
}

