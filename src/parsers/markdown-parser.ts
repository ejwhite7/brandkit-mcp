/**
 * @file markdown-parser.ts
 * @description Parses markdown files to extract guidelines, component specifications,
 * color palette documentation, typography docs, and brand voice content.
 * Supports YAML frontmatter via gray-matter.
 */

import matter from 'gray-matter';
import { marked } from 'marked';
import { readFileSync } from 'fs';
import { basename, extname } from 'path';
import type { DesignGuideline, DesignComponent, DesignColor, DesignContext } from '../types/design-system.js';

/**
 * Parses a markdown file as a design guideline.
 * @param filePath - Absolute path to the markdown file
 * @param context - Design context
 * @returns Parsed guideline with title, content, and section metadata
 */
export function parseGuidelineMarkdown(filePath: string, context: DesignContext): DesignGuideline {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`[markdown-parser] Could not read file: ${filePath}`);
    return { title: basename(filePath, extname(filePath)), content: '', context, source: filePath };
  }

  const { data: frontmatter, content } = matter(raw);

  const title =
    (frontmatter.title as string) ??
    extractFirstHeading(content) ??
    basename(filePath, extname(filePath));

  const section =
    (frontmatter.section as string) ?? inferSectionFromPath(filePath);

  return {
    title,
    content: content.trim(),
    section,
    context,
    source: filePath,
  };
}

/**
 * Parses a markdown file as component documentation.
 * Extracts component name, description, variants, and specs from heading structure.
 * @param filePath - Absolute path to the markdown file
 * @param context - Design context
 * @returns Array of parsed components
 */
export function parseComponentMarkdown(filePath: string, context: DesignContext): DesignComponent[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`[markdown-parser] Could not read file: ${filePath}`);
    return [];
  }

  const { data: frontmatter, content } = matter(raw);

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

/**
 * Parses a markdown file as color palette documentation.
 * Extracts color names, hex values, and usage notes from structured content.
 * @param filePath - Absolute path to the markdown file
 * @param context - Design context
 * @returns Array of DesignColor objects
 */
export function parsePaletteMarkdown(filePath: string, context: DesignContext): DesignColor[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`[markdown-parser] Could not read file: ${filePath}`);
    return [];
  }

  const { content } = matter(raw);
  const colors: DesignColor[] = [];

  // Match hex values with their labels
  const hexRe = /([\w\s-]+?):\s*(#[0-9a-fA-F]{3,8})/g;
  let match: RegExpExecArray | null;
  while ((match = hexRe.exec(content)) !== null) {
    const name = match[1].trim();
    const value = match[2];
    colors.push({
      name,
      token: `--color-${name.toLowerCase().replace(/\s+/g, '-')}`,
      value,
      hex: value,
      context,
      source: filePath,
    });
  }

  // Also look for table rows: | name | #hex | description |
  const tableRowRe = /\|\s*([^|]+?)\s*\|\s*(#[0-9a-fA-F]{3,8})\s*\|\s*([^|]*?)\s*\|/g;
  while ((match = tableRowRe.exec(content)) !== null) {
    const name = match[1].trim();
    if (name.toLowerCase() === 'name' || name.startsWith('---')) continue;
    const value = match[2];
    const usage = match[3]?.trim();
    colors.push({
      name,
      token: `--color-${name.toLowerCase().replace(/\s+/g, '-')}`,
      value,
      hex: value,
      usage,
      context,
      source: filePath,
    });
  }

  return colors;
}

/**
 * Infers a guideline section label from a file path.
 * e.g., brand/shared/voice/brand-voice.md -> "brand-voice"
 */
export function inferSectionFromPath(filePath: string): string {
  const base = basename(filePath, extname(filePath));
  return base.toLowerCase();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
  const re = new RegExp(`^##\\s+${heading}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$)`, 'mi');
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
