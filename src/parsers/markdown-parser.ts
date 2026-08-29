/**
 * @file markdown-parser.ts
 * @description Parses component specifications and token specimens from markdown.
 * Supports YAML frontmatter.
 */

import { basename, extname } from 'path';
import type { DesignComponent, BrandContext, TokenSpecimen } from '../types/design-system.js';
import {
  BrandIngestionLimitError,
  type BrandReadPolicy,
} from '../filesystem/brand-read-policy.js';
import { frontmatterBody, parseFrontmatter } from './frontmatter.js';

/**
 * Parses a markdown file as component documentation.
 * Extracts component name, description, variants, and specs from heading structure.
 * @param filePath - Absolute path to the markdown file
 * @param context - Design context
 * @returns Array of parsed components
 */
export function parseComponentMarkdown(
  filePath: string,
  context: BrandContext,
  reader: BrandReadPolicy,
  warnings?: string[],
): DesignComponent[] {
  let raw: string;
  try {
    raw = reader.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err instanceof BrandIngestionLimitError) throw err;
    console.error(`[markdown-parser] Could not read file: ${filePath}`);
    return [];
  }

  let frontmatter: Record<string, unknown> = {};
  let content: string;
  try {
    ({ data: frontmatter, content } = parseFrontmatter(raw));
  } catch (err) {
    if (err instanceof BrandIngestionLimitError) throw err;
    content = frontmatterBody(raw);
    warnings?.push(
      `Invalid component frontmatter in ${filePath}: ${err instanceof Error ? err.message : String(err)}; using markdown body`,
    );
  }

  const name =
    (frontmatter.name as string) ??
    extractFirstHeading(content) ??
    basename(filePath, extname(filePath));

  const category = (frontmatter.category as string) ?? inferCategoryFromName(name);
  const variants = (frontmatter.variants as string[]) ?? extractVariantsFromContent(content);
  const description = extractDescription(content);

  const component: DesignComponent = {
    name,
    category,
    description,
    variants,
    usage: extractSection(content, 'Usage') ?? extractSection(content, 'Usage Guidelines'),
    examples: extractCodeBlocks(content),
    context,
    source: filePath,
  };

  return [component];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string so it can be safely
 * interpolated into a RegExp pattern.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFirstHeading(content: string): string | undefined {
  const match = content.match(/^#+\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

function extractDescription(content: string): string {
  const lines = content.split('\n');
  const descLines: string[] = [];
  let pastHeading = false;

  for (const line of lines) {
    if (/^#+\s/.test(line)) {
      if (pastHeading) break;
      pastHeading = true;
      continue;
    }
    if (pastHeading && line.trim()) {
      descLines.push(line.trim());
    }
    if (descLines.length >= 3) break;
  }

  return descLines.join(' ');
}

function extractSection(content: string, heading: string): string | undefined {
  const escaped = escapeRegExp(heading);
  // Terminate at the next `## ` heading or true end-of-string. A bare `$`
  // with the m flag matches every line end and truncates the capture;
  // `^##\s` (not `\n##\s`) keeps an empty section empty when two headings
  // are adjacent with no blank line between them.
  const re = new RegExp(`^##\\s+${escaped}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'mi');
  const match = re.exec(content);
  return match ? match[1].trim() : undefined;
}

function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = [];
  const re = /```[\w]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function inferCategoryFromName(name: string): string {
  const lower = name.toLowerCase();
  if (/button/.test(lower)) return 'actions';
  if (/input|form|select|checkbox|radio/.test(lower)) return 'forms';
  if (/card|modal|dialog|drawer/.test(lower)) return 'containers';
  if (/nav|menu|tab|breadcrumb/.test(lower)) return 'navigation';
  if (/heading|text|paragraph|label/.test(lower)) return 'typography';
  if (/icon|avatar|badge|image/.test(lower)) return 'media';
  return 'general';
}

function extractVariantsFromContent(content: string): string[] {
  const variants: string[] = [];
  const re = /^###\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    variants.push(match[1].trim());
  }
  return variants;
}

// ---------------------------------------------------------------------------
// v2 — Token specimens
// ---------------------------------------------------------------------------

export interface TokenSpecimenResult {
  specimen: TokenSpecimen | null;
  warnings: string[];
}

/**
 * Parse a token specimen markdown file with required frontmatter.
 * @param filePath - Absolute path to the token specimen markdown file
 * @returns Parse result with specimen, warnings
 */
export function parseTokenSpecimen(filePath: string, reader: BrandReadPolicy): TokenSpecimenResult {
  const warnings: string[] = [];
  let raw: string;
  try {
    raw = reader.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err instanceof BrandIngestionLimitError) throw err;
    return { specimen: null, warnings: [`Could not read ${filePath}`] };
  }
  let data: Record<string, unknown>;
  let content: string;
  try {
    ({ data, content } = parseFrontmatter(raw));
  } catch (err) {
    if (err instanceof BrandIngestionLimitError) throw err;
    return {
      specimen: null,
      warnings: [
        `Invalid token frontmatter in ${filePath}: ${err instanceof Error ? err.message : String(err)}; skipping`,
      ],
    };
  }
  const name = data.name as string | undefined;
  const type = data.type as string | undefined;
  // value may legitimately be falsy (0, false) — check presence, not truthiness.
  const hasValue = data.value !== undefined && data.value !== null;
  if (!name || !hasValue || !type) {
    warnings.push(
      `Token specimen at ${filePath} missing required frontmatter (name/value/type); skipping`,
    );
    return { specimen: null, warnings };
  }
  // YAML parses bare numbers/booleans to non-strings; TokenSpecimen.value is a string.
  const value = String(data.value);
  return {
    specimen: {
      name,
      value,
      type,
      role: data.role as string | undefined,
      related: data.related as string[] | undefined,
      body: content.trim(),
      source: filePath,
    },
    warnings,
  };
}
