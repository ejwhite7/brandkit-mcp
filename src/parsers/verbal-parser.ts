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
  // Tolerance principle: malformed frontmatter must not abort the scan.
  // Fall back to treating the whole file as body with empty frontmatter.
  let data: Record<string, unknown> = {};
  let content = raw;
  try {
    const parsed = matter(raw);
    data = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch {
    // keep defaults: empty frontmatter, full raw body
  }
  return {
    frontmatter: data,
    body: content.trim(),
    source: path,
  };
}
