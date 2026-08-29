/**
 * @file context-resolver.ts
 * @description v2 context resolution engine for BrandKit MCP.
 *
 * Merges the base visual layer with web or product artifact overrides to produce
 * a fully resolved ResolvedDesignSystem for each BrandContext (base, web, product).
 *
 * Merge rules:
 * 1. For base: return base data as-is.
 * 2. For web/product: overlay overrides on base. If a piece exists in the override,
 *    the override wins; otherwise fall through to base.
 * 3. Component/token/asset/font arrays: override item with the same key replaces the
 *    base item; items only in base carry forward; items only in override are added.
 * 4. colorsAndType + motion are single objects — override wins if present, else base.
 *
 * Note: v2 assets (logos, textures, etc.) are folded into .textures; get_assets
 * surfaces them to callers.
 */

import type {
  BrandContext,
  ResolvedDesignSystem,
  AssetInventory,
  DesignColor,
  DesignTypographyItem,
  DesignTexture,
  DesignLogoSystem,
  DesignFont,
  DesignCSSFile,
  AssetEntry,
  FontFace,
  DesignComponent,
  TokenSpecimen,
} from './types/design-system.js';
import type { RawContextData } from './indexer/types.js';
import type { ScanResult } from './scanner/directory-scanner.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  brandName: string;
  brandDescription?: string;
}

/** Stable identities shared by merging and context-diff consumers. */
export const contextItemKeys = {
  component: (item: DesignComponent) => item.name.toLowerCase(),
  token: (item: TokenSpecimen) => item.name.toLowerCase(),
  asset: (item: AssetEntry) => item.id ?? item.file,
  font: (item: FontFace) =>
    `${item.family.toLowerCase()}:${item.weight ?? ''}:${item.style ?? ''}`,
};

/**
 * Resolves all three contexts (base, web, product) from a ScanResult.
 * Returns a record keyed by BrandContext, each containing a fully resolved
 * ResolvedDesignSystem.
 */
export function resolveAll(
  scan: ScanResult,
  opts: ResolveOptions,
): Record<BrandContext, ResolvedDesignSystem> {
  return materializeAll(resolveContexts(scan), opts);
}

/** Build the canonical raw-data view consumed by tools, previews, and search. */
export function resolveContexts(scan: ScanResult): Record<BrandContext, RawContextData> {
  return {
    base: scan.base,
    web: mergeContext(scan.base, scan.web),
    product: mergeContext(scan.base, scan.product),
  };
}

/** Materialize already-merged context data without resolving it a second time. */
export function materializeAll(
  contexts: Record<BrandContext, RawContextData>,
  opts: ResolveOptions,
): Record<BrandContext, ResolvedDesignSystem> {
  return {
    base: materialize(contexts.base, 'base', opts),
    web: materialize(contexts.web, 'web', opts),
    product: materialize(contexts.product, 'product', opts),
  };
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/**
 * Merges two arrays using a key function. Override items replace base items
 * with the same key; remaining base items are preserved; override-only items
 * are appended.
 */
function mergeByKey<T>(base: T[], override: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of base) {
    map.set(keyFn(item), item);
  }
  for (const item of override) {
    map.set(keyFn(item), item);
  }
  return Array.from(map.values());
}

/**
 * Merges two RawContextData objects: override wins on single-object fields
 * (colorsAndType, motion); arrays are merged by key.
 */
function mergeContext(base: RawContextData, override: RawContextData): RawContextData {
  return {
    colorsAndType: override.colorsAndType ?? base.colorsAndType,
    components: mergeByKey(
      base.components,
      override.components,
      contextItemKeys.component,
    ),
    tokens: mergeByKey(base.tokens, override.tokens, contextItemKeys.token),
    assets: mergeByKey(
      base.assets,
      override.assets,
      contextItemKeys.asset,
    ),
    fonts: mergeByKey(
      base.fonts,
      override.fonts,
      contextItemKeys.font,
    ),
    motion: override.motion ?? base.motion,
  };
}

// ---------------------------------------------------------------------------
// CSS custom property extraction
// ---------------------------------------------------------------------------

/** Token name patterns that indicate a color. */
const COLOR_TOKEN_RE = /^--color-/i;

/** Matches common CSS color value formats. */
const COLOR_VALUE_RE =
  /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\()/i;

/** Token name patterns that indicate a typography value. */
const TYPO_TOKEN_RE =
  /^--(font-|type-|text-|heading|body|display|caption|label|title|letter-spacing|line-height)/i;

/**
 * Derives a human-readable name from a CSS custom property token.
 * "--color-primary-500" → "Color Primary 500"
 */
function tokenToName(token: string): string {
  return token
    .replace(/^--/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extracts DesignColor entries from a CSS file's custom properties.
 * A property is treated as a color if its name starts with --color- OR its
 * value looks like a CSS color literal.
 */
function extractColors(css: DesignCSSFile, ctx: BrandContext): DesignColor[] {
  const colors: DesignColor[] = [];
  for (const [token, value] of Object.entries(css.customProperties)) {
    if (COLOR_TOKEN_RE.test(token) || COLOR_VALUE_RE.test(value.trim())) {
      colors.push({
        name: tokenToName(token),
        token,
        value: value.trim(),
        context: ctx,
        source: css.filePath,
      });
    }
  }
  return colors;
}

/**
 * Extracts DesignTypographyItem entries from a CSS file's custom properties.
 * Properties whose name matches common typography token patterns are included.
 */
function extractTypography(css: DesignCSSFile, ctx: BrandContext): DesignTypographyItem[] {
  const items: DesignTypographyItem[] = [];
  for (const [token, value] of Object.entries(css.customProperties)) {
    if (!TYPO_TOKEN_RE.test(token)) continue;
    const item: DesignTypographyItem = {
      name: tokenToName(token),
      token,
      context: ctx,
      source: css.filePath,
    };
    const lower = token.toLowerCase();
    const trimmed = value.trim();
    if (lower.includes('font-family') || lower.includes('font-display') || lower.includes('font-body')) {
      item.fontFamily = trimmed;
    } else if (lower.includes('letter-spacing') || lower.includes('tracking')) {
      item.letterSpacing = trimmed;
    } else if (lower.includes('line-height')) {
      item.lineHeight = trimmed;
    } else if (lower.includes('text-transform')) {
      item.textTransform = trimmed;
    } else if (lower.includes('font-size') || lower.includes('size')) {
      item.fontSize = trimmed;
    } else if (lower.includes('font-weight') || lower.includes('weight')) {
      item.fontWeight = trimmed;
    } else if (/(^|-)line(-|$)/.test(lower)) {
      item.lineHeight = trimmed;
    }
    items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Asset → Texture mapping
// ---------------------------------------------------------------------------

function assetToTexture(entry: AssetEntry, ctx: BrandContext): DesignTexture {
  return {
    name: entry.id ?? entry.file,
    filePath: entry.filePath,
    format: entry.format,
    usage: entry.purpose,
    context: ctx,
    source: entry.filePath,
  };
}

// ---------------------------------------------------------------------------
// Font mapping
// ---------------------------------------------------------------------------

function fontFaceToDesignFont(face: FontFace): DesignFont {
  return {
    family: face.family,
    weight: face.weight,
    style: face.style,
    filePath: face.filePath,
    format: face.format,
  };
}

// ---------------------------------------------------------------------------
// Inventory builder
// ---------------------------------------------------------------------------

function buildInventory(ds: Omit<ResolvedDesignSystem, 'assetInventory'>): AssetInventory {
  return {
    totalFiles:
      ds.colors.length +
      ds.typography.length +
      (ds.logos.variants?.length ?? 0) +
      ds.components.length +
      ds.textures.length +
      ds.guidelines.length +
      ds.cssFiles.length +
      ds.fonts.length +
      ds.pdfTexts.length,
    colors: ds.colors.length,
    typography: ds.typography.length,
    logos: ds.logos.variants?.length ?? 0,
    components: ds.components.length,
    textures: ds.textures.length,
    guidelines: ds.guidelines.length,
    cssFiles: ds.cssFiles.length,
    fonts: ds.fonts.length,
    pdfs: ds.pdfTexts.length,
  };
}

const EMPTY_LOGO_SYSTEM: DesignLogoSystem = { variants: [] };

// ---------------------------------------------------------------------------
// Materialize: RawContextData → ResolvedDesignSystem
// ---------------------------------------------------------------------------

/**
 * Converts merged RawContextData into a ResolvedDesignSystem.
 *
 * colorsAndType.customProperties are split into .colors and .typography by
 * token-name heuristics. assets are bridged to .textures; tokens are kept on
 * .tokens but not mapped into colors/typography — downstream tooling reads
 * from the raw index. motion is not surfaced here.
 */
function materialize(
  raw: RawContextData,
  ctx: BrandContext,
  opts: ResolveOptions,
): ResolvedDesignSystem {
  const colors: DesignColor[] = raw.colorsAndType
    ? extractColors(raw.colorsAndType, ctx)
    : [];

  const typography: DesignTypographyItem[] = raw.colorsAndType
    ? extractTypography(raw.colorsAndType, ctx)
    : [];

  const components: DesignComponent[] = raw.components.map((c) => ({
    ...c,
    context: ctx,
  }));

  const textures: DesignTexture[] = raw.assets.map((a) => assetToTexture(a, ctx));

  const fonts: DesignFont[] = raw.fonts.map(fontFaceToDesignFont);

  const tokens: TokenSpecimen[] = raw.tokens;

  // cssFiles: expose colorsAndType CSS file (motion.css is not surfaced here)
  const cssFiles: DesignCSSFile[] = raw.colorsAndType ? [raw.colorsAndType] : [];

  const partial = {
    name: opts.brandName,
    description: opts.brandDescription,
    context: ctx,
    colors,
    typography,
    logos: EMPTY_LOGO_SYSTEM,
    components,
    textures,
    guidelines: [],
    fonts,
    cssFiles,
    pdfTexts: [],
    tokens,
  };

  return {
    ...partial,
    assetInventory: buildInventory(partial),
  };
}
