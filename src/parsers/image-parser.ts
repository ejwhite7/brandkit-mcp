/**
 * @file image-parser.ts
 * @description Catalogs image files (logos, textures, swatches) in the design system.
 * Extracts dimensions and metadata using sharp. SVG files are handled as text.
 */

import sharp from 'sharp';
import { readFileSync, statSync } from 'fs';
import { basename, extname } from 'path';

/**
 * Processes an image file and returns metadata.
 * @param filePath - Absolute path to the image file
 * @returns Image metadata including dimensions, format, and file size
 */
export async function parseImageFile(filePath: string): Promise<{
  filePath: string;
  name: string;
  format: string;
  width?: number;
  height?: number;
  fileSize: number;
  base64?: string;
}> {
  const ext = extname(filePath).toLowerCase().replace('.', '');
  const name = basename(filePath, extname(filePath));
  let fileSize: number;

  try {
    fileSize = statSync(filePath).size;
  } catch {
    fileSize = 0;
  }

  if (ext === 'svg') {
    let svgContent: string;
    try {
      svgContent = readFileSync(filePath, 'utf-8');
    } catch {
      return { filePath, name, format: 'svg', fileSize };
    }

    const widthMatch = svgContent.match(/width="(\d+)/);
    const heightMatch = svgContent.match(/height="(\d+)/);

    return {
      filePath,
      name,
      format: 'svg',
      width: widthMatch ? parseInt(widthMatch[1], 10) : undefined,
      height: heightMatch ? parseInt(heightMatch[1], 10) : undefined,
      fileSize,
    };
  }

  try {
    const meta = await sharp(filePath).metadata();
    return {
      filePath,
      name,
      format: meta.format ?? ext,
      width: meta.width,
      height: meta.height,
      fileSize,
    };
  } catch (err) {
    console.error(`[image-parser] Failed to read image metadata: ${filePath}`, err);
    return { filePath, name, format: ext, fileSize };
  }
}

/**
 * Generates a base64 data URI for an image file.
 * For SVGs, reads as text and encodes as UTF-8 data URI.
 * For raster images, uses sharp to optimize and encode.
 * @param filePath - Absolute path to the image file
 * @returns Base64 data URI string
 */
export async function generateBase64DataURI(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase().replace('.', '');

  if (ext === 'svg') {
    const svgContent = readFileSync(filePath, 'utf-8');
    const encoded = Buffer.from(svgContent).toString('base64');
    return `data:image/svg+xml;base64,${encoded}`;
  }

  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  const mime = mimeMap[ext] ?? `image/${ext}`;

  try {
    const buffer = await sharp(filePath).toBuffer();
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    const raw = readFileSync(filePath);
    return `data:${mime};base64,${raw.toString('base64')}`;
  }
}

/**
 * Infers a logo variant name from a filename.
 * e.g., "logo-primary.svg" -> "Primary"
 *       "logo-mark.png" -> "Mark"
 *       "logo-wordmark-dark.svg" -> "Wordmark Dark"
 */
export function inferLogoVariantName(filename: string): string {
  const name = basename(filename, extname(filename));
  const cleaned = name
    .replace(/^logo[-_]?/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (!cleaned) return 'Primary';
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

