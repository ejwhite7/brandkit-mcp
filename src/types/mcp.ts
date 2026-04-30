/**
 * @file mcp.ts
 * @description Argument types for every MCP tool that BrandKit MCP exposes.
 *
 * Each interface maps 1-to-1 with a tool's `input_schema`. Keeping them in
 * a shared types module ensures the tool registration code, the handler
 * implementations, and the tests all agree on the argument shapes.
 */

// ---------------------------------------------------------------------------
// get_colors
// ---------------------------------------------------------------------------

/** Arguments for the `get_colors` MCP tool */
export interface GetColorsArgs {
  /** Filter colors to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';

  /** Filter by semantic role (e.g. "primary", "secondary", "accent") */
  role?: string;

  /** Output format for the color list */
  format?: 'json' | 'css' | 'scss' | 'tailwind';
}

// ---------------------------------------------------------------------------
// get_typography
// ---------------------------------------------------------------------------

/** Arguments for the `get_typography` MCP tool */
export interface GetTypographyArgs {
  /** Filter typography styles to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';

  /** Output format for the typography list */
  format?: 'json' | 'css' | 'scss';
}

// ---------------------------------------------------------------------------
// get_logos
// ---------------------------------------------------------------------------

/** Arguments for the `get_logos` MCP tool */
export interface GetLogosArgs {
  /** Filter by variant name (e.g. "Primary", "Monochrome Dark") */
  variant?: string;

  /**
   * Response format:
   * - "metadata": Returns dimensions, paths, and guidelines only
   * - "base64": Includes base64-encoded image data for inline rendering
   */
  format?: 'metadata' | 'base64';
}

// ---------------------------------------------------------------------------
// get_components
// ---------------------------------------------------------------------------

/** Arguments for the `get_components` MCP tool */
export interface GetComponentsArgs {
  /** Filter components to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';

  /** Filter by component category (e.g. "button", "form", "navigation") */
  category?: string;

  /** Filter by component name (case-insensitive partial match) */
  name?: string;
}

// ---------------------------------------------------------------------------
// get_guidelines
// ---------------------------------------------------------------------------

/** Arguments for the `get_guidelines` MCP tool */
export interface GetGuidelinesArgs {
  /** Filter guidelines to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';

  /** Filter by guideline section (e.g. "brand-voice", "accessibility") */
  section?: string;
}

// ---------------------------------------------------------------------------
// get_tokens
// ---------------------------------------------------------------------------

/** Arguments for the `get_tokens` MCP tool */
export interface GetTokensArgs {
  /** Filter tokens to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';

  /**
   * Output format:
   * - "css": CSS custom properties
   * - "scss": SCSS variables
   * - "tailwind": Tailwind CSS theme extension
   * - "w3c": W3C Design Tokens Community Group format
   * - "json": Plain JSON key-value pairs
   */
  format: 'css' | 'scss' | 'tailwind' | 'w3c' | 'json';

  /** Restrict output to a specific token category */
  category?: 'colors' | 'typography' | 'spacing' | 'all';
}

// ---------------------------------------------------------------------------
// get_textures
// ---------------------------------------------------------------------------

/** Arguments for the `get_textures` MCP tool */
export interface GetTexturesArgs {
  /** Filter textures to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';
}

// ---------------------------------------------------------------------------
// get_css
// ---------------------------------------------------------------------------

/** Arguments for the `get_css` MCP tool */
export interface GetCSSArgs {
  /** Filter CSS files to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';

  /** When true, include the full raw CSS text in the response */
  includeRaw?: boolean;
}

// ---------------------------------------------------------------------------
// search_brand
// ---------------------------------------------------------------------------

/** Arguments for the `search_brand` MCP tool */
export interface SearchBrandArgs {
  /** Free-text search query across all design-system content */
  query: string;

  /** Restrict search to a specific design context */
  context?: 'marketing' | 'product' | 'shared' | 'all';

  /** Maximum number of results to return (default: 10) */
  limit?: number;
}

// ---------------------------------------------------------------------------
// get_context_diff
// ---------------------------------------------------------------------------

/** Arguments for the `get_context_diff` MCP tool */
export interface GetContextDiffArgs {
  /**
   * Which category to diff between marketing and product contexts.
   * "all" returns diffs for every category.
   */
  category?: 'colors' | 'typography' | 'components' | 'all';
}

// ---------------------------------------------------------------------------
// validate_usage
// ---------------------------------------------------------------------------

/** Arguments for the `validate_usage` MCP tool */
export interface ValidateUsageArgs {
  /** The type of design element to validate */
  type: 'color' | 'font' | 'logo';

  /** The value to validate (color hex/name, font family, or logo variant name) */
  value: string;

  /** The context where this value is being used */
  context?: 'marketing' | 'product';

  /** Free-text description of how the element is being used, for richer validation */
  useCase?: string;
}

