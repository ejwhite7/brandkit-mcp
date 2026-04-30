/**
 * @file design-system.ts
 * @description Core type definitions for the BrandKit MCP design system.
 *
 * These interfaces define the canonical shape of every design token, asset,
 * and guideline that BrandKit MCP can parse, resolve, and expose to LLM
 * tools via the Model Context Protocol.
 *
 * All types are pure data -- no runtime logic lives here. Parsers produce
 * these shapes; the MCP tool handlers consume them.
 */

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/**
 * Represents a single color in the design system.
 * Colors can come from CSS custom properties, palette markdown, or structured config.
 */
export interface DesignColor {
  /** Human-readable color name, e.g. "Primary Blue" */
  name: string;

  /** CSS custom property or design-token name, e.g. "--color-primary" */
  token: string;

  /** Raw color value as authored, e.g. "#1a1a2e" or "rgb(26, 26, 46)" */
  value: string;

  /** Normalized six- or eight-character hex value, e.g. "#1a1a2e" */
  hex?: string;

  /** Usage guideline extracted from accompanying documentation */
  usage?: string;

  /**
   * Semantic role this color fills in the palette.
   * Standard roles: "primary", "secondary", "accent", "neutral",
   * "error", "success", "warning", "info".
   */
  role?: string;

  /** Which design context this color belongs to */
  context?: DesignContext;

  /** Absolute or config-relative file path this color was parsed from */
  source?: string;
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * A single typographic style definition (e.g. "Heading 1", "Body Large").
 */
export interface DesignTypographyItem {
  /** Human-readable style name, e.g. "Heading 1", "Body Large" */
  name: string;

  /** CSS custom property if the style is tokenized */
  token?: string;

  /** Font family stack, e.g. "'Inter', sans-serif" */
  fontFamily?: string;

  /** Font size with unit, e.g. "1.5rem", "24px" */
  fontSize?: string;

  /** Font weight as a CSS keyword or numeric value */
  fontWeight?: string | number;

  /** Line height with or without unit, e.g. "1.5", "28px" */
  lineHeight?: string;

  /** Letter spacing, e.g. "-0.02em" */
  letterSpacing?: string;

  /** Text transform rule, e.g. "uppercase", "capitalize" */
  textTransform?: string;

  /** Guidance on when to apply this typographic style */
  usage?: string;

  /** Which design context this style belongs to */
  context?: DesignContext;

  /** File path this was parsed from */
  source?: string;
}

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------

/**
 * A single logo file variant (e.g. full-color SVG, monochrome PNG).
 */
export interface DesignLogoVariant {
  /**
   * Descriptive variant name.
   * Examples: "Primary", "Mark", "Wordmark", "Monochrome Light", "Monochrome Dark"
   */
  name: string;

  /** Relative path to the logo file within the brand directory */
  filePath: string;

  /** Image format of this variant */
  format: 'svg' | 'png' | 'jpg' | 'webp';

  /** Intrinsic width in pixels (populated during parsing for raster formats) */
  width?: number;

  /** Intrinsic height in pixels (populated during parsing for raster formats) */
  height?: number;

  /** Base64-encoded data URI for delivering the logo over MCP without file access */
  base64?: string;

  /**
   * Recommended background color for this variant.
   * "light" = use on light backgrounds, "dark" = use on dark backgrounds,
   * "transparent" = has transparency, "any" = works on any background.
   */
  backgroundColor?: 'light' | 'dark' | 'transparent' | 'any';
}

/**
 * The complete logo system for a brand, including all variants and usage rules.
 */
export interface DesignLogoSystem {
  /** All available logo variants */
  variants: DesignLogoVariant[];

  /** Prose guidelines parsed from a usage-guidelines.md file */
  usageGuidelines?: string;

  /** Required clear-space specification, e.g. "Equal to the height of the logomark" */
  clearSpace?: string;

  /** Minimum reproduction size, e.g. "24px height for digital" */
  minimumSize?: string;

  /** List of explicitly forbidden logo treatments */
  forbiddenUsage?: string[];

  /** File path this data was parsed from */
  source?: string;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * A UI component documented in the design system (e.g. Button, Card, Modal).
 */
export interface DesignComponent {
  /** Component name, e.g. "Button", "Modal", "Card" */
  name: string;

  /** Broad category for grouping: "button", "form", "navigation", "layout", etc. */
  category: string;

  /** Short description of the component's purpose */
  description?: string;

  /** Named variants, e.g. ["primary", "secondary", "ghost", "danger"] */
  variants?: string[];

  /** Key CSS property specifications as key-value pairs */
  specs?: Record<string, string>;

  /** Guidance on when and how to use this component */
  usage?: string;

  /** Code snippets or markup patterns demonstrating correct usage */
  examples?: string[];

  /** Which design context this component belongs to */
  context?: DesignContext;

  /** File path this was parsed from */
  source?: string;
}

// ---------------------------------------------------------------------------
// Textures & Backgrounds
// ---------------------------------------------------------------------------

/**
 * A texture or background-pattern asset in the design system.
 */
export interface DesignTexture {
  /** Human-readable texture name */
  name: string;

  /** Relative path to the texture file */
  filePath: string;

  /** File format, e.g. "svg", "png", "jpg" */
  format: string;

  /** Guidance on where or how to apply this texture */
  usage?: string;

  /** Which design context this texture belongs to */
  context?: DesignContext;

  /** File path this was parsed from */
  source?: string;
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

/**
 * A single font file in the design system (e.g. a .woff2 web font).
 */
export interface DesignFont {
  /** Font family name, e.g. "Inter" */
  family: string;

  /** Font weight (numeric or keyword), e.g. 400, "bold" */
  weight?: string | number;

  /** Font style */
  style?: 'normal' | 'italic';

  /** Relative path to the font file */
  filePath: string;

  /** Font file format */
  format: 'woff2' | 'otf' | 'ttf' | 'woff';
}

// ---------------------------------------------------------------------------
// Guidelines
// ---------------------------------------------------------------------------

/**
 * A prose design guideline (e.g. brand voice document, accessibility rules).
 */
export interface DesignGuideline {
  /** Title of the guideline document */
  title: string;

  /** Full markdown content of the guideline */
  content: string;

  /**
   * Thematic section this guideline belongs to.
   * Examples: "brand-voice", "accessibility", "logo-usage", "color-usage"
   */
  section?: string;

  /** Which design context this guideline applies to */
  context?: DesignContext;

  /** File path this was parsed from */
  source?: string;
}

// ---------------------------------------------------------------------------
// CSS Files
// ---------------------------------------------------------------------------

/**
 * A parsed CSS file with extracted custom properties and class names.
 */
export interface DesignCSSFile {
  /** Relative path to the CSS file */
  filePath: string;

  /** Full raw CSS text */
  rawContent: string;

  /** Map of CSS custom-property names to their declared values */
  customProperties: Record<string, string>;

  /** CSS class names defined in this file */
  classes?: string[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * The two design contexts BrandKit MCP differentiates between.
 *
 * - "marketing": Styles, tokens, and assets for the public marketing site.
 * - "product": Styles, tokens, and assets for the authenticated product/app UI.
 * - "shared": Design elements common to both contexts.
 */
export type DesignContext = 'marketing' | 'product' | 'shared';

// ---------------------------------------------------------------------------
// Resolved Design System
// ---------------------------------------------------------------------------

/**
 * The complete, fully resolved design system for a given context (or all contexts).
 *
 * This is the top-level data structure that MCP tool handlers operate on.
 * It is produced by merging the shared layer with a context-specific layer,
 * where context-specific values override shared values for the same token.
 */
export interface ResolvedDesignSystem {
  /** Brand or company name */
  name: string;

  /** Optional brand description */
  description?: string;

  /** The context this resolution represents, or "all" for the full merge */
  context: DesignContext | 'all';

  /** All resolved color tokens */
  colors: DesignColor[];

  /** All resolved typography styles */
  typography: DesignTypographyItem[];

  /** Logo system with all variants and guidelines */
  logos: DesignLogoSystem;

  /** Documented UI components */
  components: DesignComponent[];

  /** Background textures and patterns */
  textures: DesignTexture[];

  /** Prose design guidelines */
  guidelines: DesignGuideline[];

  /** Font files available in the system */
  fonts: DesignFont[];

  /** Parsed CSS files with extracted tokens */
  cssFiles: DesignCSSFile[];

  /** Text content extracted from PDF brand documents */
  pdfTexts: Array<{ filePath: string; content: string; title?: string }>;

  /** Summary counts of all discovered assets */
  assetInventory: AssetInventory;
}

// ---------------------------------------------------------------------------
// Asset Inventory
// ---------------------------------------------------------------------------

/**
 * Summary counts of all assets discovered during parsing.
 * Used by the MCP server's asset-inventory resource.
 */
export interface AssetInventory {
  /** Total number of files processed */
  totalFiles: number;

  /** Number of color tokens discovered */
  colors: number;

  /** Number of typography styles discovered */
  typography: number;

  /** Number of logo variants discovered */
  logos: number;

  /** Number of UI components documented */
  components: number;

  /** Number of texture/pattern assets */
  textures: number;

  /** Number of guideline documents */
  guidelines: number;

  /** Number of CSS files parsed */
  cssFiles: number;

  /** Number of font files discovered */
  fonts: number;

  /** Number of PDF documents parsed */
  pdfs: number;
}

