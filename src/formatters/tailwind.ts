/**
 * @file tailwind.ts
 * @description Transforms design tokens into a Tailwind CSS theme extension object.
 */

import type { DesignColor, DesignTypographyItem } from '../types/design-system.js';

/**
 * Converts colors to a Tailwind theme.extend.colors object.
 * @param colors - Array of design colors
 * @returns Tailwind config object as a JSON string
 */
export function colorsToTailwindFormat(colors: DesignColor[]): string {
  const colorMap: Record<string, string | Record<string, string>> = {};

  for (const c of colors) {
    const key = c.token
      .replace(/^--color-/, '')
      .replace(/^--/, '');

    // Handle nested keys like "primary-light" -> { primary: { light: value } }
    const parts = key.split('-');
    if (parts.length === 1) {
      colorMap[parts[0]] = c.value;
    } else {
      const group = parts[0];
      const variant = parts.slice(1).join('-');
      if (typeof colorMap[group] === 'string') {
        colorMap[group] = { DEFAULT: colorMap[group] as string, [variant]: c.value };
      } else if (typeof colorMap[group] === 'object') {
        (colorMap[group] as Record<string, string>)[variant] = c.value;
      } else {
        colorMap[group] = { [variant]: c.value };
      }
    }
  }

  return JSON.stringify({ theme: { extend: { colors: colorMap } } }, null, 2);
}

/**
 * Converts typography to a Tailwind theme extension object.
 * @param typography - Array of typography items
 * @returns Tailwind config object as a JSON string
 */
export function typographyToTailwindFormat(typography: DesignTypographyItem[]): string {
  const fontFamily: Record<string, string[]> = {};
  const fontSize: Record<string, string> = {};

  for (const t of typography) {
    if (t.fontFamily && t.token) {
      const key = t.token.replace(/^--font-family-/, '').replace(/^--/, '');
      fontFamily[key] = t.fontFamily.split(',').map((f) => f.trim().replace(/['"]/g, ''));
    }
    if (t.fontSize && t.token) {
      const key = t.token.replace(/^--font-size-/, '').replace(/^--/, '');
      fontSize[key] = t.fontSize;
    }
  }

  const extend: Record<string, unknown> = {};
  if (Object.keys(fontFamily).length > 0) extend.fontFamily = fontFamily;
  if (Object.keys(fontSize).length > 0) extend.fontSize = fontSize;

  return JSON.stringify({ theme: { extend } }, null, 2);
}

/**
 * Converts all tokens to a full Tailwind theme extension.
 */
export function toTailwindFormat(colors: DesignColor[], typography: DesignTypographyItem[]): string {
  const colorMap: Record<string, string | Record<string, string>> = {};
  for (const c of colors) {
    const key = c.token.replace(/^--color-/, '').replace(/^--/, '');
    colorMap[key] = c.value;
  }

  const fontFamily: Record<string, string[]> = {};
  const fontSize: Record<string, string> = {};
  for (const t of typography) {
    if (t.fontFamily && t.token) {
      const key = t.token.replace(/^--font-family-/, '').replace(/^--/, '');
      fontFamily[key] = t.fontFamily.split(',').map((f) => f.trim().replace(/['"]/g, ''));
    }
    if (t.fontSize && t.token) {
      const key = t.token.replace(/^--font-size-/, '').replace(/^--/, '');
      fontSize[key] = t.fontSize;
    }
  }

  const extend: Record<string, unknown> = {};
  if (Object.keys(colorMap).length > 0) extend.colors = colorMap;
  if (Object.keys(fontFamily).length > 0) extend.fontFamily = fontFamily;
  if (Object.keys(fontSize).length > 0) extend.fontSize = fontSize;

  return JSON.stringify({ theme: { extend } }, null, 2);
}

