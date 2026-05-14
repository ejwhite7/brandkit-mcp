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

import { readdirSync, statSync, existsSync, readFileSync, realpathSync } from 'fs';
import { join, extname, relative, sep, basename } from 'path';
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
import type { BrandKitConfig } from '../types/config.js';

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
  /** Directory prefix patterns to skip (relative to rootDir). Defaults to ['human/']. */
  ignore?: string[];
}

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
  const ignore = options?.ignore ?? ['human/'];
  const warnings: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. magic_trick.md
  // ---------------------------------------------------------------------------
  const magicTrick = parseMagicTrick(rootDir, warnings);

  // ---------------------------------------------------------------------------
  // 2. Verbal layer
  // ---------------------------------------------------------------------------
  const verbal = parseVerbalLayer(rootDir, warnings);

  // ---------------------------------------------------------------------------
  // 3. Base visual layer (agent/visual/)
  // ---------------------------------------------------------------------------
  const baseVisualDir = join(rootDir, 'agent', 'visual');
  const base = parseVisualDir(baseVisualDir, 'base', ignore, warnings);

  // ---------------------------------------------------------------------------
  // 4. Web overrides (agent/visual/artifacts/web/)
  // ---------------------------------------------------------------------------
  const webVisualDir = join(rootDir, 'agent', 'visual', 'artifacts', 'web');
  const web = parseVisualDir(webVisualDir, 'web', ignore, warnings);

  // ---------------------------------------------------------------------------
  // 5. Product overrides (agent/visual/artifacts/product/)
  // ---------------------------------------------------------------------------
  const productVisualDir = join(rootDir, 'agent', 'visual', 'artifacts', 'product');
  const product = parseVisualDir(productVisualDir, 'product', ignore, warnings);

  return { magicTrick, verbal, base, web, product, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseMagicTrick(rootDir: string, warnings: string[]): MagicTrick | undefined {
  const filePath = join(rootDir, 'magic_trick.md');
  if (!existsSync(filePath)) return undefined;
  try {
    const content = readFileSync(filePath, 'utf-8');
    return { content: content.trim(), source: filePath };
  } catch (err) {
    warnings.push(`Could not read magic_trick.md: ${(err as Error).message}`);
    return undefined;
  }
}

function parseVerbalLayer(rootDir: string, warnings: string[]): VerbalLayer {
  const verbalDir = join(rootDir, 'agent', 'verbal');

  // positioning
  const positioning = parseVerbalDoc(join(verbalDir, 'positioning.md'));

  // messaging
  const messaging = parseVerbalDoc(join(verbalDir, 'messaging.md'));

  // differentiation
  const differentiation = parseVerbalDoc(join(verbalDir, 'differentiation.md'));

  // concepts
  const concepts = parseVerbalDoc(join(verbalDir, 'concepts.md'));

  // voice
  const voice = parseVerbalDoc(join(verbalDir, 'voice.md'));

  // audience (YAML)
  let audience: AudienceDoc | undefined;
  const audiencePath = join(verbalDir, 'audience.yaml');
  if (existsSync(audiencePath)) {
    const result = parseYamlFile(audiencePath);
    warnings.push(...result.warnings);
    if (result.data !== null) {
      audience = { data: result.data, source: result.source };
    }
  }

  return { positioning, messaging, differentiation, concepts, voice, audience };
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
  ignore: string[],
  warnings: string[],
): RawContextData {
  if (!existsSync(visualDir)) return emptyRawContextData();

  const data = emptyRawContextData();

  // colors_and_type.css
  const cssPath = join(visualDir, 'colors_and_type.css');
  if (existsSync(cssPath)) {
    try {
      data.colorsAndType = parseCSSFile(cssPath, 'base');
    } catch (err) {
      warnings.push(`Failed to parse ${cssPath}: ${(err as Error).message}`);
    }
  }

  // components/*.md
  const componentsDir = join(visualDir, 'components');
  if (existsSync(componentsDir) && isDirectory(componentsDir)) {
    for (const file of listFiles(componentsDir, ['.md'], ignore, visualDir)) {
      try {
        const parsed = parseComponentMarkdown(file, 'base');
        data.components.push(...parsed);
      } catch (err) {
        warnings.push(`Failed to parse component ${file}: ${(err as Error).message}`);
      }
    }
  }

  // tokens/*.md
  const tokensDir = join(visualDir, 'tokens');
  if (existsSync(tokensDir) && isDirectory(tokensDir)) {
    for (const file of listFiles(tokensDir, ['.md'], ignore, visualDir)) {
      try {
        const { specimen, warnings: w } = parseTokenSpecimen(file);
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
  if (existsSync(motionDir) && isDirectory(motionDir)) {
    try {
      const result = parseMotionDir(motionDir);
      // Only add warnings that don't mention missing motion.json when there's
      // at least a motion.css (partial motion systems are valid)
      warnings.push(...result.warnings);
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
  if (existsSync(fontsDir) && isDirectory(fontsDir)) {
    data.fonts = parseFontsDir(fontsDir, ignore, visualDir, warnings);
  }

  // assets/
  const assetsDir = join(visualDir, 'assets');
  if (existsSync(assetsDir) && isDirectory(assetsDir)) {
    data.assets = parseAssetsDir(assetsDir, ignore, visualDir, warnings);
  }

  return data;
}

// Font extensions
const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.otf', '.ttf']);

// Image extensions
const IMAGE_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

function parseFontsDir(
  fontsDir: string,
  ignore: string[],
  visualRoot: string,
  warnings: string[],
): FontFace[] {
  const fonts: FontFace[] = [];

  // Load optional fonts.yaml for metadata overrides
  const fontsYamlPath = join(fontsDir, 'fonts.yaml');
  let fontsYamlData: Record<string, unknown> | null = null;
  if (existsSync(fontsYamlPath)) {
    const result = parseYamlFile(fontsYamlPath);
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
  const physicalFontFiles = listFiles(fontsDir, [...FONT_EXTENSIONS], ignore, visualRoot);

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
      fonts.push({
        family: meta.family ?? 'Unknown',
        weight: meta.weight,
        style: (meta.style as 'normal' | 'italic' | undefined) ?? 'normal',
        file,
        filePath: join(fontsDir, file),
        format: ext || 'woff2',
      });
    }
  }

  return fonts;
}

function parseAssetsDir(
  assetsDir: string,
  ignore: string[],
  visualRoot: string,
  warnings: string[],
): AssetEntry[] {
  const assets: AssetEntry[] = [];

  // Load optional assets.yaml for metadata
  const assetsYamlPath = join(assetsDir, 'assets.yaml');
  let assetsYamlData: Record<string, unknown> | null = null;
  if (existsSync(assetsYamlPath)) {
    const result = parseYamlFile(assetsYamlPath);
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

  const physicalAssetFiles = listFiles(assetsDir, [...IMAGE_EXTENSIONS], ignore, visualRoot);

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
      assets.push({
        id: meta.id,
        file,
        purpose: meta.purpose,
        format: ext,
        filePath: join(assetsDir, file),
      });
    }
  }

  return assets;
}

/**
 * List all files in a directory (non-recursive for flat directories,
 * but uses walkDir for nested cases) matching given extensions.
 * Files whose relative path from `rootDir` starts with any ignore prefix are skipped.
 */
function listFiles(
  dir: string,
  extensions: string[],
  ignore: string[],
  rootDir: string,
): string[] {
  const results: string[] = [];
  walkDir(dir, extensions, ignore, rootDir, results);
  return results;
}

function walkDir(
  dir: string,
  extensions: string[],
  ignore: string[],
  rootDir: string,
  results: string[],
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;

    const fullPath = join(dir, entry);

    // Symlink containment check
    let realPath: string;
    try {
      realPath = realpathSync(fullPath);
    } catch {
      continue; // broken symlink
    }

    let realRoot: string;
    try {
      realRoot = realpathSync(rootDir);
    } catch {
      realRoot = rootDir;
    }

    if (realPath !== realRoot && !realPath.startsWith(realRoot + sep)) {
      continue; // symlink escape
    }

    // Check ignore list against relative path from rootDir
    const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');
    if (ignore.some((prefix) => relPath === prefix || relPath.startsWith(prefix))) {
      continue;
    }

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(fullPath, extensions, ignore, rootDir, results);
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Legacy exports (v1 API) — kept so the rest of the codebase still compiles.
// These are replaced in subsequent tasks.
// ---------------------------------------------------------------------------

import type { DesignContext } from '../types/design-system.js';

/** @deprecated Use scanBrandRoot instead. Retained for migration compatibility. */
export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  context: DesignContext;
  subdirectory: string;
  fileType: 'css' | 'markdown' | 'pdf' | 'image' | 'font' | 'unknown';
  filename: string;
  extension: string;
}

/** @deprecated Use scanBrandRoot instead. Retained for migration compatibility. */
export function scanBrandDirectory(_config: BrandKitConfig): DiscoveredFile[] {
  return [];
}

/** @deprecated Use scanBrandRoot instead. Retained for migration compatibility. */
export function inferContextFromPath(_filePath: string, _config: BrandKitConfig): DesignContext {
  return 'base';
}

/** @deprecated Use scanBrandRoot instead. Retained for migration compatibility. */
export function classifyFileType(filename: string): DiscoveredFile['fileType'] {
  const ext = extname(filename).toLowerCase();
  const EXTENSION_MAP: Record<string, DiscoveredFile['fileType']> = {
    '.css': 'css',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.pdf': 'pdf',
    '.svg': 'image',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.webp': 'image',
    '.gif': 'image',
    '.woff2': 'font',
    '.woff': 'font',
    '.otf': 'font',
    '.ttf': 'font',
  };
  return EXTENSION_MAP[ext] ?? 'unknown';
}
