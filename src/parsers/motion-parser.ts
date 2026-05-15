/**
 * @file motion-parser.ts
 * @description Parses motion.json and motion.css files together as a motion system.
 * Tolerant: handles missing or malformed files gracefully.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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
export function parseMotionDir(dir: string): MotionParseResult {
  const warnings: string[] = [];
  const jsonPath = join(dir, 'motion.json');
  const cssPath = join(dir, 'motion.css');

  let tokens: unknown = null;
  if (existsSync(jsonPath)) {
    try {
      tokens = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    } catch (err) {
      warnings.push(`Invalid motion.json: ${(err as Error).message}`);
    }
  } else {
    warnings.push(`No motion.json found in ${dir}`);
  }

  let css = '';
  if (existsSync(cssPath)) {
    try {
      css = readFileSync(cssPath, 'utf-8');
    } catch (err) {
      warnings.push(`Could not read motion.css: ${(err as Error).message}`);
    }
  }

  return { tokens, css, warnings, source: dir };
}
