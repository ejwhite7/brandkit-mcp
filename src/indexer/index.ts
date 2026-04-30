/**
 * @file index.ts
 * @description Design System Indexer -- orchestrates all parsers to build a
 * complete in-memory index of the design system.
 *
 * Scans the brand directory, runs appropriate parsers on each file,
 * and assembles the results into a structured, queryable DesignSystemIndex.
 *
 * Context resolution: shared assets are merged with context-specific assets.
 * Context-specific values override shared values for the same token/name.
 */

import type { BrandKitConfig } from '../types/config.js';
import type { DesignLogoSystem, DesignLogoVariant, DesignContext } from '../types/design-system.js';
import type { DesignSystemIndex, RawContextData, SearchIndexEntry } from './types.js';
import { scanBrandDirectory } from '../scanner/directory-scanner.js';
import type { DiscoveredFile } from '../scanner/directory-scanner.js';
import { parseCSSFile, extractColorsFromCSS, extractTypographyFromCSS } from '../parsers/css-parser.js';
import { parseGuidelineMarkdown, parseComponentMarkdown, parsePaletteMarkdown } from '../parsers/markdown-parser.js';
import { parsePDFFile, extractGuidelinesFromPDF } from '../parsers/pdf-parser.js';
import { parseImageFile, inferLogoVariantName } from '../parsers/image-parser.js';
import { parseFontFile } from '../parsers/font-parser.js';
import { resolveContext, mergeAllContexts } from '../context-resolver.js';

/** Empty raw context data used as a starting point. */
function emptyRawContext(): RawContextData {
  return {
    colors: [],
    typography: [],
    logos: { variants: [] },
    components: [],
    textures: [],
    guidelines: [],
    fonts: [],
    cssFiles: [],
    pdfTexts: [],
  };
}

/**
 * Builds the complete design system index from the brand directory.
 * This is the main entry point called by the MCP server on startup
 * and when file changes are detected (hot reload).
 * @param config - Loaded BrandKit config with resolved paths
 * @returns The complete design system index
 */
export async function buildDesignSystemIndex(config: BrandKitConfig): Promise<DesignSystemIndex> {
  const files = scanBrandDirectory(config);

  const shared = emptyRawContext();
  const marketing = emptyRawContext();
  const product = emptyRawContext();

  const contextMap: Record<DesignContext, RawContextData> = { shared, marketing, product };

  for (const file of files) {
    const bucket = contextMap[file.context] ?? shared;
    await processFile(file, bucket);
  }

  const resolvedMarketing = resolveContext(shared, marketing, 'marketing', config.name, config.description);
  const resolvedProduct = resolveContext(shared, product, 'product', config.name, config.description);
  const resolvedAll = mergeAllContexts(shared, marketing, product, config.name, config.description);

  const searchIndex = buildSearchIndex({
    shared,
    marketing,
    product,
    resolved: { marketing: resolvedMarketing, product: resolvedProduct, all: resolvedAll },
    searchIndex: [],
    lastIndexed: new Date(),
  });

  return {
    shared,
    marketing,
    product,
    resolved: {
      marketing: resolvedMarketing,
      product: resolvedProduct,
      all: resolvedAll,
    },
    searchIndex,
    lastIndexed: new Date(),
  };
}

/**
 * Processes a single discovered file through the appropriate parser
 * and adds results to the context bucket.
 */
async function processFile(file: DiscoveredFile, bucket: RawContextData): Promise<void> {
  try {
    switch (file.fileType) {
      case 'css': {
        const cssFile = parseCSSFile(file.absolutePath, file.context);
        bucket.cssFiles.push(cssFile);
        const colors = extractColorsFromCSS(cssFile.customProperties, file.context, file.absolutePath);
        bucket.colors.push(...colors);
        const typography = extractTypographyFromCSS(cssFile.customProperties, file.context, file.absolutePath);
        bucket.typography.push(...typography);
        break;
      }

      case 'markdown': {
        if (file.subdirectory === 'components') {
          const components = parseComponentMarkdown(file.absolutePath, file.context);
          bucket.components.push(...components);
        } else if (file.subdirectory === 'colors' && file.filename.includes('palette')) {
          const colors = parsePaletteMarkdown(file.absolutePath, file.context);
          bucket.colors.push(...colors);
        } else {
          const guideline = parseGuidelineMarkdown(file.absolutePath, file.context);
          bucket.guidelines.push(guideline);
        }
        break;
      }

      case 'pdf': {
        const pdfResult = await parsePDFFile(file.absolutePath);
        bucket.pdfTexts.push(pdfResult);
        const guidelines = extractGuidelinesFromPDF(pdfResult.content, file.absolutePath, file.context);
        bucket.guidelines.push(...guidelines);
        break;
      }

      case 'image': {
        const imageMeta = await parseImageFile(file.absolutePath);
        if (file.subdirectory === 'logos') {
          const variant: DesignLogoVariant = {
            name: inferLogoVariantName(file.filename),
            filePath: file.relativePath,
            format: imageMeta.format as DesignLogoVariant['format'],
            width: imageMeta.width,
            height: imageMeta.height,
          };
          bucket.logos.variants.push(variant);
        } else if (file.subdirectory === 'textures') {
          bucket.textures.push({
            name: imageMeta.name,
            filePath: file.relativePath,
            format: imageMeta.format,
            context: file.context,
            source: file.absolutePath,
          });
        }
        break;
      }

      case 'font': {
        const font = parseFontFile(file.absolutePath);
        bucket.fonts.push(font);
        break;
      }
    }
  } catch (err) {
    console.error(`[indexer] Error processing ${file.absolutePath}:`, err);
  }
}

/**
 * Builds a flat search index from the design system for full-text search.
 * Each indexed entry has a searchable `content` string.
 * @param index - The design system index
 * @returns Array of search index entries
 */
export function buildSearchIndex(index: DesignSystemIndex): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];

  const addFromContext = (ctx: RawContextData, contextLabel: DesignContext) => {
    for (const color of ctx.colors) {
      entries.push({
        id: `color:${contextLabel}:${color.token}`,
        type: 'color',
        name: color.name,
        content: [color.name, color.token, color.value, color.hex, color.usage, color.role].filter(Boolean).join(' '),
        context: contextLabel,
        source: color.source,
      });
    }

    for (const typo of ctx.typography) {
      entries.push({
        id: `typography:${contextLabel}:${typo.token ?? typo.name}`,
        type: 'typography',
        name: typo.name,
        content: [typo.name, typo.token, typo.fontFamily, typo.fontSize, typo.fontWeight?.toString(), typo.usage].filter(Boolean).join(' '),
        context: contextLabel,
        source: typo.source,
      });
    }

    for (const comp of ctx.components) {
      entries.push({
        id: `component:${contextLabel}:${comp.name}`,
        type: 'component',
        name: comp.name,
        content: [comp.name, comp.category, comp.description, comp.usage, ...(comp.variants ?? [])].filter(Boolean).join(' '),
        context: contextLabel,
        source: comp.source,
      });
    }

    for (const guide of ctx.guidelines) {
      entries.push({
        id: `guideline:${contextLabel}:${guide.title}`,
        type: 'guideline',
        name: guide.title,
        content: [guide.title, guide.section, guide.content.slice(0, 2000)].filter(Boolean).join(' '),
        context: contextLabel,
        source: guide.source,
      });
    }

    for (const variant of ctx.logos.variants) {
      entries.push({
        id: `logo:${contextLabel}:${variant.name}`,
        type: 'logo',
        name: variant.name,
        content: [variant.name, variant.format, variant.filePath].filter(Boolean).join(' '),
        context: contextLabel,
      });
    }

    for (const texture of ctx.textures) {
      entries.push({
        id: `texture:${contextLabel}:${texture.name}`,
        type: 'texture',
        name: texture.name,
        content: [texture.name, texture.format, texture.usage].filter(Boolean).join(' '),
        context: contextLabel,
        source: texture.source,
      });
    }
  };

  addFromContext(index.shared, 'shared');
  addFromContext(index.marketing, 'marketing');
  addFromContext(index.product, 'product');

  return entries;
}

/**
 * Performs full-text search across the search index.
 * @param query - Search query string
 * @param entries - Array of search index entries
 * @param limit - Maximum results to return
 * @param context - Optional context filter
 * @returns Matching entries with relevance scores and snippets
 */
export function searchIndex(
  query: string,
  entries: SearchIndexEntry[],
  limit: number = 10,
  context?: string,
): Array<SearchIndexEntry & { score: number; snippet: string }> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  const results: Array<SearchIndexEntry & { score: number; snippet: string }> = [];

  for (const entry of entries) {
    if (context && context !== 'all' && entry.context !== context) continue;

    const contentLower = entry.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const idx = contentLower.indexOf(term);
      if (idx !== -1) {
        score += 1;
        // Bonus for name match
        if (entry.name.toLowerCase().includes(term)) score += 2;
      }
    }

    if (score > 0) {
      const snippetIdx = contentLower.indexOf(queryTerms[0]);
      const snippetStart = Math.max(0, snippetIdx - 40);
      const snippetEnd = Math.min(entry.content.length, snippetIdx + 120);
      const snippet = (snippetStart > 0 ? '...' : '') + entry.content.slice(snippetStart, snippetEnd).trim() + (snippetEnd < entry.content.length ? '...' : '');

      results.push({ ...entry, score, snippet });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

