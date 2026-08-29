/**
 * @file verbal-parser.ts
 * @description Parses verbal/agent markdown documents with optional YAML frontmatter.
 */

import type { VerbalDoc } from '../types/design-system.js';
import {
  BrandIngestionLimitError,
  type BrandReadPolicy,
} from '../filesystem/brand-read-policy.js';
import { parseFrontmatter } from './frontmatter.js';

/**
 * Parse a verbal/agent markdown document with frontmatter support.
 * @param path - Absolute path to the markdown file
 * @returns Parsed verbal document or undefined if file doesn't exist
 */
export function parseVerbalDoc(path: string, reader: BrandReadPolicy): VerbalDoc | undefined {
  if (!reader.isFile(path)) return undefined;
  let raw: string;
  try {
    raw = reader.readFile(path, 'utf-8');
  } catch (err) {
    if (err instanceof BrandIngestionLimitError) throw err;
    return undefined;
  }
  // Tolerance principle: malformed frontmatter must not abort the scan.
  // Fall back to treating the whole file as body with empty frontmatter.
  let data: Record<string, unknown> = {};
  let content = raw;
  try {
    const parsed = parseFrontmatter(raw);
    data = parsed.data;
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
