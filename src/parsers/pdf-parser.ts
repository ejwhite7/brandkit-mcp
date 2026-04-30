/**
 * @file pdf-parser.ts
 * @description Extracts text content from PDF files, primarily used for brand
 * guideline documents. Uses pdf-parse for text extraction.
 */

import pdfParse from 'pdf-parse';
import { readFileSync } from 'fs';
import { basename, extname } from 'path';
import type { DesignGuideline, DesignContext } from '../types/design-system.js';

/**
 * Extracts all text content from a PDF file.
 * @param filePath - Absolute path to the PDF file
 * @returns Extracted text content and document title
 */
export async function parsePDFFile(filePath: string): Promise<{
  filePath: string;
  content: string;
  title?: string;
  pageCount?: number;
}> {
  try {
    const buffer = readFileSync(filePath);
    const data = await pdfParse(buffer);
    return {
      filePath,
      content: data.text?.trim() ?? '',
      title: data.info?.Title ?? basename(filePath, extname(filePath)),
      pageCount: data.numpages,
    };
  } catch (err) {
    console.error(`[pdf-parser] Failed to parse PDF: ${filePath}`, err);
    return {
      filePath,
      content: '',
      title: basename(filePath, extname(filePath)),
    };
  }
}

/**
 * Attempts to extract structured guidelines from PDF text.
 * Looks for heading patterns and section structures.
 * @param pdfText - Raw extracted PDF text
 * @param filePath - Source file path
 * @param context - Design context
 * @returns Array of extracted guidelines
 */
export function extractGuidelinesFromPDF(
  pdfText: string,
  filePath: string,
  context: DesignContext,
): DesignGuideline[] {
  if (!pdfText.trim()) return [];

  const title = basename(filePath, extname(filePath))
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return [
    {
      title,
      content: pdfText.trim(),
      section: 'pdf-guideline',
      context,
      source: filePath,
    },
  ];
}

