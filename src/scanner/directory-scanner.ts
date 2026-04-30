/**
 * @file directory-scanner.ts
 * @description Recursively walks the brand directory structure and discovers
 * all design system files. Categorizes files by type (CSS, markdown, PDF,
 * image, font) and design context (shared, marketing, product) based on
 * their directory location.
 */

import { readdirSync, statSync, realpathSync } from 'fs';
import { join, extname, relative, sep } from 'path';
import type { BrandKitConfig } from '../types/config.js';
import type { DesignContext } from '../types/design-system.js';

/** A file discovered during the brand directory scan. */
export interface DiscoveredFile {
  /** Absolute path to the file. */
  absolutePath: string;
  /** Path relative to the brand directory root. */
  relativePath: string;
  /** Design context inferred from the file's directory location. */
  context: DesignContext;
  /** Subdirectory category, e.g. "logos", "colors", "components". */
  subdirectory: string;
  /** Detected file type based on extension. */
  fileType: 'css' | 'markdown' | 'pdf' | 'image' | 'font' | 'unknown';
  /** Original filename. */
  filename: string;
  /** File extension (lowercase, with dot). */
  extension: string;
}

/** Maps file extensions to file types. */
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

/**
 * Scans the entire brand directory and returns all discovered files categorized
 * by type and context.
 * @param config - Loaded and path-resolved BrandKit config
 * @returns Array of discovered files
 */
export function scanBrandDirectory(config: BrandKitConfig): DiscoveredFile[] {
  const brandDir = config.paths.brand;
  const files: DiscoveredFile[] = [];

  // Resolve the real brand root once so we can detect symlink escapes
  let realBrandRoot: string;
  try {
    realBrandRoot = realpathSync(brandDir);
  } catch (err) {
    console.error(`[scanner] Failed to resolve brand directory: ${brandDir}`, err);
    return files;
  }

  try {
    walkDirectory(brandDir, brandDir, config, files, realBrandRoot);
  } catch (err) {
    console.error(`[scanner] Failed to scan brand directory: ${brandDir}`, err);
  }

  return files;
}

/**
 * Determines the design context of a file based on its path.
 * Files under brand/shared/ -> 'shared'
 * Files under brand/marketing/ -> 'marketing'
 * Files under brand/product/ -> 'product'
 * @param filePath - Relative path within the brand directory
 * @param config - BrandKit config
 * @returns Design context
 */
export function inferContextFromPath(filePath: string, config: BrandKitConfig): DesignContext {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();

  const marketingDir = relative(config.paths.brand, config.paths.marketing).replace(/\\/g, '/').toLowerCase();
  const productDir = relative(config.paths.brand, config.paths.product).replace(/\\/g, '/').toLowerCase();
  const sharedDir = relative(config.paths.brand, config.paths.shared).replace(/\\/g, '/').toLowerCase();

  if (normalized.startsWith(marketingDir + '/') || normalized.startsWith(marketingDir)) return 'marketing';
  if (normalized.startsWith(productDir + '/') || normalized.startsWith(productDir)) return 'product';
  if (normalized.startsWith(sharedDir + '/') || normalized.startsWith(sharedDir)) return 'shared';

  // Default to shared for files at the brand root
  return 'shared';
}

/**
 * Determines the file type from its extension.
 * @param filename - The filename to classify
 * @returns File type
 */
export function classifyFileType(filename: string): DiscoveredFile['fileType'] {
  const ext = extname(filename).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Recursively walks a directory and collects discovered files.
 * Includes symlink containment: every entry is resolved via realpathSync
 * and skipped if it falls outside the real brand root.
 */
function walkDirectory(
  dir: string,
  brandRoot: string,
  config: BrandKitConfig,
  results: DiscoveredFile[],
  realBrandRoot: string,
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

    // --- Symlink containment check ---
    let realEntryPath: string;
    try {
      realEntryPath = realpathSync(fullPath);
    } catch {
      // Broken symlink -- skip
      continue;
    }
    if (realEntryPath !== realBrandRoot && !realEntryPath.startsWith(realBrandRoot + sep)) {
      // Symlink escape attempt -- skip silently
      continue;
    }
    // --- End containment check ---

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDirectory(fullPath, brandRoot, config, results, realBrandRoot);
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      const fileType = classifyFileType(entry);
      if (fileType === 'unknown') continue;

      const relativePath = relative(brandRoot, fullPath);
      const context = inferContextFromPath(relativePath, config);
      const subdirectory = inferSubdirectory(relativePath);

      results.push({
        absolutePath: fullPath,
        relativePath,
        context,
        subdirectory,
        fileType,
        filename: entry,
        extension: ext,
      });
    }
  }
}

/**
 * Extracts the subdirectory category from a relative path.
 * e.g. "shared/colors/colors.css" -> "colors"
 */
function inferSubdirectory(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  // Format: context/subdirectory/file or context/file
  if (parts.length >= 3) return parts[1];
  if (parts.length === 2) return parts[0];
  return '';
}
