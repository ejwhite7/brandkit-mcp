/**
 * @file verbal-parser.ts
 * @description Parses verbal/agent markdown documents with optional YAML frontmatter.
 */

import matter from 'gray-matter';
import { readFileSync, existsSync } from 'fs';
import type { VerbalDoc } from '../types/design-system.js';

/**
 * Parse a verbal/agent markdown document with frontmatter support.
 * @param path - Absolute path to the markdown file
 * @returns Parsed verbal document or undefined if file doesn't exist
 */
export function parseVerbalDoc(path: string): VerbalDoc | undefined {
  if (!existsSync(path)) return undefined;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
  const { data, content } = matter(raw);
  return {
    frontmatter: data as Record<string, unknown>,
    body: content.trim(),
    source: path,
  };
}
