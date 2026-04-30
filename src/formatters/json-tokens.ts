/**
 * @file json-tokens.ts
 * @description Returns clean structured JSON for design tokens.
 */

import type { DesignColor, DesignTypographyItem } from '../types/design-system.js';

/**
 * Converts colors to a structured JSON format.
 * @param colors - Array of design colors
 * @returns JSON string of color token data
 */
export function colorsToJSONFormat(colors: DesignColor[]): string {
  const output = colors.map((c) => ({
    name: c.name,
    token: c.token,
    value: c.value,
    hex: c.hex,
    role: c.role,
    usage: c.usage,
    context: c.context,
  }));
  return JSON.stringify(output, null, 2);
}

/**
 * Converts typography to a structured JSON format.
 * @param typography - Array of typography items
 * @returns JSON string of typography token data
 */
export function typographyToJSONFormat(typography: DesignTypographyItem[]): string {
  const output = typography.map((t) => ({
    name: t.name,
    token: t.token,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    fontWeight: t.fontWeight,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    usage: t.usage,
    context: t.context,
  }));
  return JSON.stringify(output, null, 2);
}

/**
 * Converts all tokens to a combined JSON format.
 */
export function toJSONFormat(colors: DesignColor[], typography: DesignTypographyItem[]): string {
  return JSON.stringify(
    {
      colors: colors.map((c) => ({
        name: c.name,
        token: c.token,
        value: c.value,
        hex: c.hex,
        role: c.role,
        usage: c.usage,
        context: c.context,
      })),
      typography: typography.map((t) => ({
        name: t.name,
        token: t.token,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        usage: t.usage,
        context: t.context,
      })),
    },
    null,
    2,
  );
}

