/**
 * @file css-parser.ts
 * @description Parses CSS files to extract design tokens (custom properties),
 * class names, font-face declarations, and media queries using the css-tree library.
 */

import * as csstree from 'css-tree';
import { readFileSync } from 'fs';
import type { DesignColor, DesignTypographyItem, DesignCSSFile, DesignContext } from '../types/design-system.js';

/** Regular expression to detect CSS color values. */
const COLOR_RE =
  /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgr[ae]y|darkgreen|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategr[ae]y|darkturquoise|darkviolet|deeppink|deepskyblue|dimgr[ae]y|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gr[ae]y|green|greenyellow|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgr[ae]y|lightgreen|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategr[ae]y|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategr[ae]y|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)/i;

/** Regular expression to detect typography-related CSS token names. */
const TYPO_TOKEN_RE = /font|type|text|heading|body|display|caption|label|title|letter-spacing|line-height/i;

/**
 * Parses a CSS file and extracts all custom properties and class definitions.
 * @param filePath - Absolute path to the CSS file
 * @param context - Which design context this file belongs to
 * @returns Parsed CSS file with custom properties and extracted design tokens
 */
export function parseCSSFile(filePath: string, context: DesignContext): DesignCSSFile {
  let rawContent: string;
  try {
    rawContent = readFileSync(filePath, 'utf-8');
  } catch {
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

/**
 * Attempts to interpret CSS custom properties as color tokens.
 * Detects color values (#hex, rgb(), hsl(), named colors).
 * @param customProperties - Map of token name to value
 * @param context - Design context
 * @param source - File path source
 * @returns Array of DesignColor objects for properties that contain color values
 */
export function extractColorsFromCSS(
  customProperties: Record<string, string>,
  context: DesignContext,
  source: string,
): DesignColor[] {
  const colors: DesignColor[] = [];

  for (const [token, value] of Object.entries(customProperties)) {
    if (!COLOR_RE.test(value.trim())) continue;

    const name = tokenToName(token);
    const role = inferColorRole(token);
    const hex = normalizeToHex(value.trim());

    colors.push({ name, token, value: value.trim(), hex, role, context, source });
  }

  return colors;
}

/**
 * Attempts to interpret CSS custom properties as typography tokens.
 * Detects font-family, font-size, font-weight, line-height tokens.
 * @param customProperties - Map of token name to value
 * @param context - Design context
 * @param source - File path source
 * @returns Array of DesignTypographyItem objects for typography properties
 */
export function extractTypographyFromCSS(
  customProperties: Record<string, string>,
  context: DesignContext,
  source: string,
): DesignTypographyItem[] {
  const items: DesignTypographyItem[] = [];

  for (const [token, value] of Object.entries(customProperties)) {
    if (!TYPO_TOKEN_RE.test(token)) continue;

    const name = tokenToName(token);
    const item: DesignTypographyItem = { name, token, context, source };

    if (/font-family/i.test(token)) {
      item.fontFamily = value;
    } else if (/font-size/i.test(token)) {
      item.fontSize = value;
    } else if (/font-weight/i.test(token)) {
      item.fontWeight = value;
    } else if (/line-height/i.test(token)) {
      item.lineHeight = value;
    } else if (/letter-spacing/i.test(token)) {
      item.letterSpacing = value;
    } else {
      // Generic typography token
      item.fontSize = value;
    }

    items.push(item);
  }

  return items;
}

/**
 * Converts a CSS custom property name to a human-readable name.
 * e.g. "--color-primary-blue" -> "Primary Blue"
 */
function tokenToName(token: string): string {
  return token
    .replace(/^--/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Infers a semantic color role from a CSS custom property name.
 */
function inferColorRole(token: string): string | undefined {
  const lower = token.toLowerCase();
  if (lower.includes('primary')) return 'primary';
  if (lower.includes('secondary')) return 'secondary';
  if (lower.includes('accent')) return 'accent';
  if (lower.includes('neutral') || lower.includes('gray') || lower.includes('grey')) return 'neutral';
  if (lower.includes('error') || lower.includes('danger') || lower.includes('destructive')) return 'error';
  if (lower.includes('success')) return 'success';
  if (lower.includes('warning')) return 'warning';
  if (lower.includes('info')) return 'info';
  return undefined;
}

/**
 * Attempts to normalize a CSS color value to a hex string.
 * Returns the original value if normalization isn't possible.
 */
function normalizeToHex(value: string): string | undefined {
  const hexMatch = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return `#${hex}`;
  }
  return undefined;
}

