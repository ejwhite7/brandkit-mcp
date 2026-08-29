/**
 * @file yaml-parser.ts
 * @description Tolerant YAML parser that gracefully handles malformed input
 * and missing files without throwing.
 */

import { load } from 'js-yaml';
import {
  BrandIngestionLimitError,
  type BrandReadPolicy,
} from '../filesystem/brand-read-policy.js';

export interface YamlParseResult {
  data: unknown;
  warnings: string[];
  source: string;
}

/**
 * Parse a YAML file with tolerance for missing or malformed input.
 * @param path - Absolute path to the YAML file
 * @returns Parse result with data, warnings, and source metadata
 */
export function parseYamlFile(path: string, reader: BrandReadPolicy): YamlParseResult {
  let text: string;
  try {
    text = reader.readFile(path, 'utf-8');
  } catch (err) {
    if (err instanceof BrandIngestionLimitError) throw err;
    return {
      data: null,
      warnings: [`Could not read YAML file: ${path} (${(err as Error).message})`],
      source: path,
    };
  }

  try {
    const data = load(text);
    return { data: data ?? null, warnings: [], source: path };
  } catch (err) {
    return {
      data: null,
      warnings: [`Invalid YAML in ${path}: ${(err as Error).message}`],
      source: path,
    };
  }
}
