/**
 * @file types.ts
 * @description Type definitions for the design system indexer.
 *
 * Defines the shape of the in-memory design system index that the MCP
 * server queries at runtime.  The indexer builds this structure once on
 * startup (and rebuilds on hot-reload), and every tool handler reads
 * from it.
 */

import type {
  DesignColor,
  DesignTypographyItem,
  DesignLogoSystem,
  DesignComponent,
  DesignTexture,
  DesignGuideline,
  DesignFont,
  DesignCSSFile,
  DesignContext,
  ResolvedDesignSystem,
} from '../types/design-system.js';

// ---------------------------------------------------------------------------
// Raw context bucket -- what the parsers produce per directory context
// ---------------------------------------------------------------------------

/** Raw parsed data for a single context (shared, marketing, or product). */
export interface RawContextData {
  colors: DesignColor[];
  typography: DesignTypographyItem[];
  logos: DesignLogoSystem;
  components: DesignComponent[];
  textures: DesignTexture[];
  guidelines: DesignGuideline[];
  fonts: DesignFont[];
  cssFiles: DesignCSSFile[];
  pdfTexts: Array<{ filePath: string; content: string; title?: string }>;
}

// ---------------------------------------------------------------------------
// Search index entry
// ---------------------------------------------------------------------------

/** A single entry in the flat full-text search index. */
export interface SearchIndexEntry {
  /** Unique ID for this entry (deterministic from type + name + context). */
  id: string;

  /** Asset category this entry belongs to. */
  type: 'color' | 'typography' | 'component' | 'guideline' | 'logo' | 'texture' | 'css' | 'font';

  /** Human-readable name of the asset. */
  name: string;

  /** Searchable text blob assembled from all relevant fields. */
  content: string;

  /** Design context the asset belongs to. */
  context: DesignContext | 'shared';

  /** Source file path. */
  source?: string;
}

// ---------------------------------------------------------------------------
// Design system index -- the master in-memory data structure
// ---------------------------------------------------------------------------

/** The complete in-memory design system index. */
export interface DesignSystemIndex {
  /** Raw parsed data for the shared context. */
  shared: RawContextData;

  /** Raw parsed data for the marketing context. */
  marketing: RawContextData;

  /** Raw parsed data for the product context. */
  product: RawContextData;

  /** Resolved (merged) design systems for each context and for "all". */
  resolved: {
    marketing: ResolvedDesignSystem;
    product: ResolvedDesignSystem;
    all: ResolvedDesignSystem;
  };

  /** Flat search index built from all resolved data. */
  searchIndex: SearchIndexEntry[];

  /** Timestamp of the last successful indexing run. */
  lastIndexed: Date;
}

