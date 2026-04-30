/**
 * @file font-parser.ts
 * @description Catalogs web font files (.woff2, .otf, .ttf, .woff) in the design system.
 * Extracts font family and weight metadata from filenames and metadata.
 */

import { basename, extname } from 'path';
import type { DesignFont } from '../types/design-system.js';

/** Maps common weight names to numeric values. */
const WEIGHT_MAP: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

/**
 * Parses a font file and extracts metadata.
 * Infers family name, weight, and style from the filename.
 * e.g., "inter-700-normal.woff2" -> family: Inter, weight: 700, style: normal
 * @param filePath - Absolute path to the font file
 * @returns DesignFont metadata
 */
export function parseFontFile(filePath: string): DesignFont {
  const ext = extname(filePath).toLowerCase().replace('.', '');
  const name = basename(filePath, extname(filePath));

  const format = ext as DesignFont['format'];
  const parts = name.split(/[-_]+/);

  let family = '';
  let weight: string | number | undefined;
  let style: 'normal' | 'italic' = 'normal';

  const familyParts: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();

    if (lower === 'italic' || lower === 'oblique') {
      style = 'italic';
      continue;
    }

    if (lower === 'normal' || lower === 'regular') {
      continue;
    }

    const numWeight = parseInt(lower, 10);
    if (!isNaN(numWeight) && numWeight >= 100 && numWeight <= 900) {
      weight = numWeight;
      continue;
    }

    if (WEIGHT_MAP[lower] !== undefined) {
      weight = WEIGHT_MAP[lower];
      continue;
    }

    familyParts.push(part.charAt(0).toUpperCase() + part.slice(1));
  }

  family = familyParts.join(' ') || 'Unknown';
  weight = weight ?? 400;

  return { family, weight, style, filePath, format };
}

/**
 * Infers font weight from a filename component.
 * Handles numeric weights (400, 700) and named weights (regular, bold, light, etc.)
 * @param filename - Filename or filename segment
 * @returns Numeric weight or undefined
 */
export function inferFontWeight(filename: string): string | number | undefined {
  const lower = filename.toLowerCase();

  const num = parseInt(lower, 10);
  if (!isNaN(num) && num >= 100 && num <= 900) return num;

  for (const [name, value] of Object.entries(WEIGHT_MAP)) {
    if (lower.includes(name)) return value;
  }

  return undefined;
}

