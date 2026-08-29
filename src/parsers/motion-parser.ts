/**
 * @file motion-parser.ts
 * @description Parses motion.json and motion.css files together as a motion system.
 * Tolerant: handles missing or malformed files gracefully.
 */

import { join } from 'path';
import type { BrandReadPolicy } from '../filesystem/brand-read-policy.js';

export interface MotionParseResult {
  tokens: unknown;
  css: string;
  warnings: string[];
  source: string;
}

/**
 * Parse a motion system directory containing motion.json and motion.css.
 * @param dir - Absolute path to the directory containing motion files
 * @returns Parse result with tokens, CSS, warnings, and source metadata
 */
export function parseMotionDir(dir: string, reader: BrandReadPolicy): MotionParseResult {
  const warnings: string[] = [];
  const jsonPath = join(dir, 'motion.json');
  const cssPath = join(dir, 'motion.css');

  let tokens: unknown = null;
  if (reader.isFile(jsonPath)) {
    try {
      tokens = JSON.parse(reader.readFile(jsonPath, 'utf-8'));
    } catch (err) {
      warnings.push(`Invalid motion.json: ${(err as Error).message}`);
    }
  } else {
    warnings.push(`No motion.json found in ${dir}`);
  }

  let css = '';
  if (reader.isFile(cssPath)) {
    try {
      css = reader.readFile(cssPath, 'utf-8');
    } catch (err) {
      warnings.push(`Could not read motion.css: ${(err as Error).message}`);
    }
  }

  return { tokens, css, warnings, source: dir };
}
