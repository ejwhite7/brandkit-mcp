/**
 * @file css-parser.ts
 * @description Parses CSS files to extract custom properties and class names.
 */

import * as csstree from 'css-tree';
import type { DesignCSSFile, BrandContext } from '../types/design-system.js';
import {
  BrandIngestionLimitError,
  type BrandReadPolicy,
} from '../filesystem/brand-read-policy.js';

/**
 * Parses a CSS file and extracts all custom properties and class definitions.
 * @param filePath - Absolute path to the CSS file
 * @param context - Which design context this file belongs to
 * @returns Parsed CSS file with custom properties and class names
 */
export function parseCSSFile(filePath: string, _context: BrandContext, reader: BrandReadPolicy): DesignCSSFile {
  let rawContent: string;
  try {
    rawContent = reader.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err instanceof BrandIngestionLimitError) throw err;
    console.error(`[css-parser] Could not read file: ${filePath}`);
    return { filePath, rawContent: '', customProperties: {}, classes: [] };
  }

  const customProperties: Record<string, string> = {};
  const classes: string[] = [];

  try {
    const ast = csstree.parse(rawContent, { parseCustomProperty: true });

    csstree.walk(ast, {
      visit: 'Declaration',
      enter(node) {
        if (node.property.startsWith('--')) {
          const value = csstree.generate(node.value);
          customProperties[node.property] = value;
        }
      },
    });

    csstree.walk(ast, {
      visit: 'ClassSelector',
      enter(node) {
        if (!classes.includes(node.name)) {
          classes.push(node.name);
        }
      },
    });
  } catch {
    // Fallback: regex-based extraction for files css-tree can't parse
    const propRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match: RegExpExecArray | null;
    while ((match = propRe.exec(rawContent)) !== null) {
      customProperties[match[1]] = match[2].trim();
    }
  }

  return { filePath, rawContent, customProperties, classes };
}
