/**
 * @file context-resolver.ts
 * @description Context resolution engine for BrandKit MCP.
 *
 * The design system supports three directory-level contexts: shared,
 * marketing, and product. Shared assets serve as defaults; marketing
 * and product assets extend or override shared values. This module
 * performs the merge.
 *
 * Merge rules:
 * 1. Context-specific values override shared values when both have
 *    the same `token` (for colors/typography) or `name` (for components).
 * 2. Items that exist only in shared are carried forward into each context.
 * 3. Items that exist only in a context stay context-specific.
 * 4. The `all` resolved view is the union of every asset across contexts.
 */

import type {
  DesignColor,
  DesignTypographyItem,
  DesignComponent,
  DesignTexture,
  DesignGuideline,
  DesignFont,
  DesignCSSFile,
  DesignLogoSystem,
  DesignContext,
  ResolvedDesignSystem,
  AssetInventory,
} from './types/design-system.js';
import type { RawContextData } from './indexer/types.js';

/**
 * Merges two arrays of items, using a key function to detect overlaps.
 * Items from `override` replace items from `base` that share the same key.
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
 * Merges two logo systems. Context-specific variants override shared
 * variants with the same name.
 */
function mergeLogoSystems(shared: DesignLogoSystem, ctx: DesignLogoSystem): DesignLogoSystem {
  return {
    variants: mergeByKey(
      shared.variants ?? [],
      ctx.variants ?? [],
      (v) => v.name.toLowerCase(),
    ),
    usageGuidelines: ctx.usageGuidelines ?? shared.usageGuidelines,
    clearSpace: ctx.clearSpace ?? shared.clearSpace,
    minimumSize: ctx.minimumSize ?? shared.minimumSize,
    forbiddenUsage: ctx.forbiddenUsage ?? shared.forbiddenUsage,
    source: ctx.source ?? shared.source,
  };
}

/**
 * Builds an asset inventory from a resolved design system.
 */
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

const EMPTY_LOGO_SYSTEM: DesignLogoSystem = {
  variants: [],
  usageGuidelines: undefined,
  clearSpace: undefined,
  minimumSize: undefined,
  forbiddenUsage: undefined,
  source: undefined,
};

/**
 * Resolves the design system for a given context by merging shared assets
 * with context-specific assets. Context-specific values take precedence
 * over shared values when both define the same token/name.
 *
 * @param shared - Raw parsed data from the shared directory
 * @param contextData - Raw parsed data from the context-specific directory
 * @param context - Which context is being resolved
 * @param brandName - Brand name from config
 * @param brandDescription - Brand description from config
 * @returns A fully resolved design system for the given context
 */
export function resolveContext(
  shared: RawContextData,
  contextData: RawContextData,
  context: DesignContext | 'all',
  brandName: string,
  brandDescription?: string,
): ResolvedDesignSystem {
  const colors = mergeByKey(shared.colors, contextData.colors, (c) => c.token || c.name);
  const typography = mergeByKey(shared.typography, contextData.typography, (t) => t.token || t.name);
  const components = mergeByKey(shared.components, contextData.components, (c) => `${c.category}:${c.name}`);
  const textures = mergeByKey(shared.textures, contextData.textures, (t) => t.name);
  const guidelines = mergeByKey(shared.guidelines, contextData.guidelines, (g) => g.title);
  const fonts = mergeByKey(shared.fonts, contextData.fonts, (f) => `${f.family}:${f.weight}:${f.style}`);
  const cssFiles = [...shared.cssFiles, ...contextData.cssFiles];
  const pdfTexts = [...shared.pdfTexts, ...contextData.pdfTexts];
  const logos = mergeLogoSystems(shared.logos ?? EMPTY_LOGO_SYSTEM, contextData.logos ?? EMPTY_LOGO_SYSTEM);

  const partial = {
    name: brandName,
    description: brandDescription,
    context,
    colors,
    typography,
    logos,
    components,
    textures,
    guidelines,
    fonts,
    cssFiles,
    pdfTexts,
  };

  return {
    ...partial,
    assetInventory: buildInventory(partial),
  };
}

/**
 * Merges all three contexts (shared, marketing, product) into a single
 * "all" resolved view. This is used when a tool is called with context=all.
 */
export function mergeAllContexts(
  shared: RawContextData,
  marketing: RawContextData,
  product: RawContextData,
  brandName: string,
  brandDescription?: string,
): ResolvedDesignSystem {
  const allColors = [...shared.colors, ...marketing.colors, ...product.colors];
  const allTypography = [...shared.typography, ...marketing.typography, ...product.typography];
  const allComponents = [...shared.components, ...marketing.components, ...product.components];
  const allTextures = [...shared.textures, ...marketing.textures, ...product.textures];
  const allGuidelines = [...shared.guidelines, ...marketing.guidelines, ...product.guidelines];
  const allFonts = [...shared.fonts, ...marketing.fonts, ...product.fonts];
  const allCss = [...shared.cssFiles, ...marketing.cssFiles, ...product.cssFiles];
  const allPdfs = [...shared.pdfTexts, ...marketing.pdfTexts, ...product.pdfTexts];

  const mergedLogos = mergeLogoSystems(
    mergeLogoSystems(shared.logos ?? EMPTY_LOGO_SYSTEM, marketing.logos ?? EMPTY_LOGO_SYSTEM),
    product.logos ?? EMPTY_LOGO_SYSTEM,
  );

  const partial = {
    name: brandName,
    description: brandDescription,
    context: 'all' as const,
    colors: allColors,
    typography: allTypography,
    logos: mergedLogos,
    components: allComponents,
    textures: allTextures,
    guidelines: allGuidelines,
    fonts: allFonts,
    cssFiles: allCss,
    pdfTexts: allPdfs,
  };

  return {
    ...partial,
    assetInventory: buildInventory(partial),
  };
}

