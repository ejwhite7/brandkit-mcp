/**
 * @file directory-scanner.ts
 * @description Walks the v2 brand_atomic_system directory layout and produces
 * a fully-parsed ScanResult ready for the indexer to resolve and merge.
 *
 * v2 layout expected:
 *   <root>/magic_trick.md
 *   <root>/agent/verbal/{positioning,messaging,differentiation,concepts,voice}.md
 *   <root>/agent/verbal/audience.yaml
 *   <root>/agent/visual/colors_and_type.css
 *   <root>/agent/visual/components/*.md
 *   <root>/agent/visual/tokens/*.md
 *   <root>/agent/visual/motion/
 *   <root>/agent/visual/fonts/  (+ optional fonts.yaml)
 *   <root>/agent/visual/assets/ (+ optional assets.yaml)
 *   <root>/agent/visual/artifacts/web/   (same sub-structure, all optional)
 *   <root>/agent/visual/artifacts/product/ (same)
 */

import { join, extname, relative, basename, posix, resolve, isAbsolute } from 'path';
import type {
  MagicTrick,
  AudienceDoc,
  MotionSystem,
  AssetEntry,
  FontFace,
} from '../types/design-system.js';
import type { RawContextData, VerbalLayer } from '../indexer/types.js';
import { parseVerbalDoc } from '../parsers/verbal-parser.js';
import { parseYamlFile } from '../parsers/yaml-parser.js';
import { parseMotionDir } from '../parsers/motion-parser.js';
import { parseTokenSpecimen } from '../parsers/markdown-parser.js';
import { parseComponentMarkdown } from '../parsers/markdown-parser.js';
import { parseCSSFile } from '../parsers/css-parser.js';
import { parseFontFile } from '../parsers/font-parser.js';
import {
  BrandReadPolicy,
  type BrandIngestionLimits,
} from '../filesystem/brand-read-policy.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScanResult {
  magicTrick: MagicTrick | undefined;
  verbal: VerbalLayer;
  base: RawContextData;
  web: RawContextData;
  product: RawContextData;
  warnings: string[];
}

export interface ScanOptions {
  /** Paths to skip, relative to the configured brand root. Defaults to ['human/']. */
  ignore?: string[];
  /** Bounded ingestion budget. Omitted fields retain production defaults. */
  limits?: Partial<BrandIngestionLimits>;
}

export interface BrandPathIgnoreMatcher {
  matches(path: string): boolean;
}

type IgnoreMatcher = BrandPathIgnoreMatcher;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scan a v2 brand_atomic_system directory and return fully-parsed raw data.
 * Never throws on user content — bad input becomes a warning.
 *
 * @param rootDir - Absolute path to the brand root directory
 * @param options - Optional scan configuration
 */
export function scanBrandRoot(rootDir: string, options?: ScanOptions): ScanResult {
  const warnings: string[] = [];
  const reader = new BrandReadPolicy(rootDir, options?.limits);
  const ignore = createBrandPathIgnoreMatcher(
    reader.configuredRoot,
    options?.ignore ?? ['human/'],
    () => warnings.push('Ignored invalid ignore pattern: paths must stay relative to the brand root'),
  );

  // ---------------------------------------------------------------------------
  // 1. magic_trick.md
  // ---------------------------------------------------------------------------
  const magicTrick = parseMagicTrick(rootDir, ignore, reader, warnings);

  // ---------------------------------------------------------------------------
  // 2. Verbal layer
  // ---------------------------------------------------------------------------
  const verbal = parseVerbalLayer(rootDir, ignore, reader, warnings);

  // ---------------------------------------------------------------------------
  // 3. Base visual layer (agent/visual/)
  // ---------------------------------------------------------------------------
  const baseVisualDir = join(rootDir, 'agent', 'visual');
  const base = parseVisualDir(baseVisualDir, 'base', ignore, reader, warnings);

  // ---------------------------------------------------------------------------
  // 4. Web overrides (agent/visual/artifacts/web/)
  // ---------------------------------------------------------------------------
  const webVisualDir = join(rootDir, 'agent', 'visual', 'artifacts', 'web');
  const web = parseVisualDir(webVisualDir, 'web', ignore, reader, warnings);

  // ---------------------------------------------------------------------------
  // 5. Product overrides (agent/visual/artifacts/product/)
  // ---------------------------------------------------------------------------
  const productVisualDir = join(rootDir, 'agent', 'visual', 'artifacts', 'product');
  const product = parseVisualDir(productVisualDir, 'product', ignore, reader, warnings);

  reader.assertWithinLimits();
  return { magicTrick, verbal, base, web, product, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseMagicTrick(
  rootDir: string,
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
): MagicTrick | undefined {
  const filePath = join(rootDir, 'magic_trick.md');
  try {
    if (ignore.matches(filePath)) return undefined;
    if (!reader.isFile(filePath)) return undefined;
    const content = reader.readFile(filePath, 'utf-8');
    return { content: content.trim(), source: filePath };
  } catch (err) {
    warnings.push(`Could not read magic_trick.md: ${(err as Error).message}`);
    return undefined;
  }
}

function parseVerbalLayer(
  rootDir: string,
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
): VerbalLayer {
  const verbalDir = join(rootDir, 'agent', 'verbal');

  // positioning
  const positioning = parseFixedVerbal(join(verbalDir, 'positioning.md'), ignore, reader, warnings);

  // messaging
  const messaging = parseFixedVerbal(join(verbalDir, 'messaging.md'), ignore, reader, warnings);

  // differentiation
  const differentiation = parseFixedVerbal(join(verbalDir, 'differentiation.md'), ignore, reader, warnings);

  // concepts
  const concepts = parseFixedVerbal(join(verbalDir, 'concepts.md'), ignore, reader, warnings);

  // voice
  const voice = parseFixedVerbal(join(verbalDir, 'voice.md'), ignore, reader, warnings);

  // audience (YAML)
  let audience: AudienceDoc | undefined;
  const audiencePath = join(verbalDir, 'audience.yaml');
  try {
    if (!ignore.matches(audiencePath) && reader.isFile(audiencePath)) {
      const result = parseYamlFile(audiencePath, reader);
      warnings.push(...result.warnings);
      if (result.data !== null) {
        audience = { data: result.data, source: result.source };
      }
    }
  } catch (err) {
    warnings.push(`Rejected audience.yaml: ${(err as Error).message}`);
  }

  return { positioning, messaging, differentiation, concepts, voice, audience };
}

function parseFixedVerbal(
  path: string,
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
) {
  if (ignore.matches(path)) return undefined;
  try {
    return parseVerbalDoc(path, reader);
  } catch (err) {
    warnings.push(`Rejected verbal document ${path}: ${(err as Error).message}`);
    return undefined;
  }
}

function emptyRawContextData(): RawContextData {
  return {
    colorsAndType: undefined,
    components: [],
    tokens: [],
    assets: [],
    fonts: [],
    motion: undefined,
  };
}

function parseVisualDir(
  visualDir: string,
  _contextLabel: string,
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
): RawContextData {
  if (ignore.matches(visualDir)) return emptyRawContextData();
  try {
    if (!reader.isDirectory(visualDir)) return emptyRawContextData();
  } catch (err) {
    warnings.push(`Rejected visual directory ${visualDir}: ${(err as Error).message}`);
    return emptyRawContextData();
  }

  const data = emptyRawContextData();

  // colors_and_type.css
  const cssPath = join(visualDir, 'colors_and_type.css');
  if (!ignore.matches(cssPath) && safeIsFile(cssPath, reader, warnings)) {
    try {
      data.colorsAndType = parseCSSFile(cssPath, 'base', reader);
    } catch (err) {
      warnings.push(`Failed to parse ${cssPath}: ${(err as Error).message}`);
    }
  }

  // components/*.md
  const componentsDir = join(visualDir, 'components');
  if (!ignore.matches(componentsDir) && safeIsDirectory(componentsDir, reader, warnings)) {
    for (const file of listFiles(componentsDir, ['.md'], ignore, reader, warnings)) {
      try {
        const parsed = parseComponentMarkdown(file, 'base', reader);
        data.components.push(...parsed);
      } catch (err) {
        warnings.push(`Failed to parse component ${file}: ${(err as Error).message}`);
      }
    }
  }

  // tokens/*.md
  const tokensDir = join(visualDir, 'tokens');
  if (!ignore.matches(tokensDir) && safeIsDirectory(tokensDir, reader, warnings)) {
    for (const file of listFiles(tokensDir, ['.md'], ignore, reader, warnings)) {
      try {
        const { specimen, warnings: w } = parseTokenSpecimen(file, reader);
        warnings.push(...w);
        if (specimen !== null) {
          data.tokens.push(specimen);
        }
      } catch (err) {
        warnings.push(`Failed to parse token ${file}: ${(err as Error).message}`);
      }
    }
  }

  // motion/
  const motionDir = join(visualDir, 'motion');
  if (!ignore.matches(motionDir) && safeIsDirectory(motionDir, reader, warnings)) {
    try {
      const result = parseMotionDir(motionDir, reader);
      // A CSS-only motion system is valid: suppress the "No motion.json"
      // warning when motion.css is present.
      const filtered = result.css
        ? result.warnings.filter((w) => !w.startsWith('No motion.json found'))
        : result.warnings;
      warnings.push(...filtered);
      if (result.tokens !== null || result.css) {
        const motion: MotionSystem = {
          tokens: result.tokens,
          css: result.css,
          source: result.source,
        };
        data.motion = motion;
      }
    } catch (err) {
      warnings.push(`Failed to parse motion dir ${motionDir}: ${(err as Error).message}`);
    }
  }

  // fonts/
  const fontsDir = join(visualDir, 'fonts');
  if (!ignore.matches(fontsDir) && safeIsDirectory(fontsDir, reader, warnings)) {
    data.fonts = parseFontsDir(fontsDir, ignore, reader, warnings);
  }

  // assets/
  const assetsDir = join(visualDir, 'assets');
  if (!ignore.matches(assetsDir) && safeIsDirectory(assetsDir, reader, warnings)) {
    data.assets = parseAssetsDir(assetsDir, ignore, reader, warnings);
  }

  return data;
}

// Font extensions
const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.otf', '.ttf']);

// Image extensions
const IMAGE_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

function parseFontsDir(
  fontsDir: string,
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
): FontFace[] {
  const fonts: FontFace[] = [];

  // Load optional fonts.yaml for metadata overrides
  const fontsYamlPath = join(fontsDir, 'fonts.yaml');
  let fontsYamlData: Record<string, unknown> | null = null;
  if (!ignore.matches(fontsYamlPath) && safeIsFile(fontsYamlPath, reader, warnings)) {
    const result = parseYamlFile(fontsYamlPath, reader);
    warnings.push(...result.warnings);
    if (result.data && typeof result.data === 'object') {
      fontsYamlData = result.data as Record<string, unknown>;
    }
  }

  // Build a lookup from file name -> metadata from YAML
  // Expected YAML shape: { faces: [{ family, weight, style, file }] }
  const yamlFaceMap = new Map<string, { family?: string; weight?: string | number; style?: string }>();
  if (fontsYamlData?.faces && Array.isArray(fontsYamlData.faces)) {
    for (const face of fontsYamlData.faces as Array<Record<string, unknown>>) {
      if (typeof face.file === 'string') {
        yamlFaceMap.set(face.file, {
          family: face.family as string | undefined,
          weight: face.weight as string | number | undefined,
          style: face.style as string | undefined,
        });
      }
    }
  }

  // If we have YAML faces but no physical font files (metadata-only approach),
  // create FontFace entries from the YAML directly
  const physicalFontFiles = listFiles(fontsDir, [...FONT_EXTENSIONS], ignore, reader, warnings);

  if (physicalFontFiles.length > 0) {
    // Parse physical font files, merging YAML metadata
    for (const filePath of physicalFontFiles) {
      try {
        const parsed = parseFontFile(filePath);
        const fileName = basename(filePath);
        const yamlMeta = yamlFaceMap.get(fileName);

        const ext = extname(filePath).toLowerCase().replace('.', '') as FontFace['format'];
        const fontFace: FontFace = {
          family: yamlMeta?.family ?? parsed.family,
          weight: yamlMeta?.weight ?? parsed.weight,
          style: (yamlMeta?.style as 'normal' | 'italic' | undefined) ?? parsed.style ?? 'normal',
          file: fileName,
          filePath,
          format: ext,
        };
        fonts.push(fontFace);
      } catch (err) {
        warnings.push(`Failed to parse font file ${filePath}: ${(err as Error).message}`);
      }
    }
  } else if (yamlFaceMap.size > 0) {
    // No physical files — create entries from YAML metadata only
    for (const [file, meta] of yamlFaceMap) {
      const rawExt = extname(file).toLowerCase().replace('.', '');
      if (!FONT_EXTENSIONS.has('.' + rawExt)) {
        // not a font extension, skip
        continue;
      }
      const ext = rawExt as FontFace['format'];
      const filePath = join(fontsDir, file);
      try {
        reader.assertPath(filePath);
        if (reader.isDirectory(filePath)) {
          warnings.push(`Rejected font manifest entry that is not a file: ${file}`);
          continue;
        }
        // Existing manifest-declared binaries share the same ingestion budget
        // even though the index stores metadata rather than file contents.
        reader.isFile(filePath);
      } catch (err) {
        warnings.push(`Rejected font manifest entry ${file}: ${(err as Error).message}`);
        continue;
      }
      fonts.push({
        family: meta.family ?? 'Unknown',
        weight: meta.weight,
        style: (meta.style as 'normal' | 'italic' | undefined) ?? 'normal',
        file,
        filePath,
        format: ext || 'woff2',
      });
    }
  }

  return fonts;
}

function parseAssetsDir(
  assetsDir: string,
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
): AssetEntry[] {
  const assets: AssetEntry[] = [];

  // Load optional assets.yaml for metadata
  const assetsYamlPath = join(assetsDir, 'assets.yaml');
  let assetsYamlData: Record<string, unknown> | null = null;
  if (!ignore.matches(assetsYamlPath) && safeIsFile(assetsYamlPath, reader, warnings)) {
    const result = parseYamlFile(assetsYamlPath, reader);
    warnings.push(...result.warnings);
    if (result.data && typeof result.data === 'object') {
      assetsYamlData = result.data as Record<string, unknown>;
    }
  }

  // Build a lookup from file name -> YAML metadata
  // Expected shape: { assets: [{ id, file, purpose }] }
  const yamlAssetMap = new Map<string, { id?: string; purpose?: string }>();
  if (assetsYamlData?.assets && Array.isArray(assetsYamlData.assets)) {
    for (const asset of assetsYamlData.assets as Array<Record<string, unknown>>) {
      if (typeof asset.file === 'string') {
        yamlAssetMap.set(asset.file, {
          id: asset.id as string | undefined,
          purpose: asset.purpose as string | undefined,
        });
      }
    }
  }

  const physicalAssetFiles = listFiles(assetsDir, [...IMAGE_EXTENSIONS], ignore, reader, warnings);

  if (physicalAssetFiles.length > 0) {
    for (const filePath of physicalAssetFiles) {
      const fileName = basename(filePath);
      const ext = extname(filePath).toLowerCase().replace('.', '');
      const yamlMeta = yamlAssetMap.get(fileName);
      assets.push({
        id: yamlMeta?.id,
        file: fileName,
        purpose: yamlMeta?.purpose,
        format: ext,
        filePath,
      });
    }
  } else if (yamlAssetMap.size > 0) {
    // No physical files — create entries from YAML only
    for (const [file, meta] of yamlAssetMap) {
      const ext = extname(file).toLowerCase().replace('.', '');
      const filePath = join(assetsDir, file);
      try {
        reader.assertPath(filePath);
        if (reader.isDirectory(filePath)) {
          warnings.push(`Rejected asset manifest entry that is not a file: ${file}`);
          continue;
        }
        // Count an existing declared asset even when its extension is not one
        // of the auto-discovered image formats. Missing metadata-only entries
        // remain compatible and do not consume a file budget.
        reader.isFile(filePath);
      } catch (err) {
        warnings.push(`Rejected asset manifest entry ${file}: ${(err as Error).message}`);
        continue;
      }
      assets.push({
        id: meta.id,
        file,
        purpose: meta.purpose,
        format: ext,
        filePath,
      });
    }
  }

  return assets;
}

/**
 * List all files in a directory (non-recursive for flat directories,
 * but uses walkDir for nested cases) matching given extensions.
 * Files matching a brand-root-relative ignore path are skipped.
 */
function listFiles(
  dir: string,
  extensions: string[],
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
): string[] {
  const results: string[] = [];
  walkDir(dir, extensions, ignore, reader, warnings, results, new Set());
  return results;
}

function walkDir(
  dir: string,
  extensions: string[],
  ignore: IgnoreMatcher,
  reader: BrandReadPolicy,
  warnings: string[],
  results: string[],
  visited: Set<string>,
): void {
  if (ignore.matches(dir)) return;

  let identity: string | undefined;
  try {
    identity = reader.directoryIdentity(dir);
  } catch (err) {
    warnings.push(`Rejected brand directory ${dir}: ${(err as Error).message}`);
    return;
  }
  if (identity === undefined || visited.has(identity)) return;
  visited.add(identity);

  let entries: string[];
  try {
    entries = reader.readDirectory(dir);
  } catch (err) {
    warnings.push(`Rejected brand directory ${dir}: ${(err as Error).message}`);
    return;
  }

  for (const entry of entries.sort()) {
    if (entry.startsWith('.')) continue;

    const fullPath = join(dir, entry);

    if (ignore.matches(fullPath)) continue;

    try {
      if (reader.isDirectory(fullPath)) {
        walkDir(fullPath, extensions, ignore, reader, warnings, results, visited);
      } else if (reader.isFile(fullPath)) {
        const ext = extname(entry).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    } catch (err) {
      warnings.push(`Rejected brand path ${fullPath}: ${(err as Error).message}`);
      continue;
    }
  }
}

/**
 * Create the canonical matcher for configured brand-root-relative ignore
 * paths. Both scanning and hot reload use this function so an ignored path
 * cannot be reintroduced by a watcher event.
 */
export function createBrandPathIgnoreMatcher(
  rootDir: string,
  patterns: string[],
  onInvalidPattern?: (pattern: string) => void,
): BrandPathIgnoreMatcher {
  const configuredRoot = resolve(rootDir);
  const normalized = new Set<string>();

  for (const pattern of patterns) {
    const slashPattern = pattern.replace(/\\/g, '/');
    const isAbsolutePattern = slashPattern.startsWith('/') || /^[A-Za-z]:\//.test(slashPattern);
    const segments: string[] = [];
    let escapesRoot = false;

    for (const segment of slashPattern.split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (segments.length === 0) {
          escapesRoot = true;
          break;
        }
        segments.pop();
      } else {
        segments.push(segment);
      }
    }

    if (isAbsolutePattern || escapesRoot || segments.length === 0 || pattern.includes('\0')) {
      onInvalidPattern?.(pattern);
      continue;
    }
    normalized.add(posix.join(...segments));
  }
  const normalizedPatterns = [...normalized];

  return {
    matches(path: string): boolean {
      // Chokidar emits native separators, but tests and adapter layers can
      // supply paths with the other platform's separator. Ignore patterns
      // already treat both slash styles as separators, so event paths do too.
      const candidate = resolve(path.replace(/\\/g, '/'));
      const brandPath = relative(configuredRoot, candidate).replace(/\\/g, '/');
      if (brandPath === '..' || brandPath.startsWith('../') || isAbsolute(brandPath)) return false;
      return normalizedPatterns.some(
        (pattern) => brandPath === pattern || brandPath.startsWith(`${pattern}/`),
      );
    },
  };
}

function safeIsFile(p: string, reader: BrandReadPolicy, warnings: string[]): boolean {
  try {
    return reader.isFile(p);
  } catch (err) {
    warnings.push(`Rejected brand file ${p}: ${(err as Error).message}`);
    return false;
  }
}

function safeIsDirectory(p: string, reader: BrandReadPolicy, warnings: string[]): boolean {
  try {
    return reader.isDirectory(p);
  } catch (err) {
    warnings.push(`Rejected brand directory ${p}: ${(err as Error).message}`);
    return false;
  }
}
