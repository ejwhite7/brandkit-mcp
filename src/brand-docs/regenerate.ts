/**
 * @file brand-docs/regenerate.ts
 * @description Orchestrates "regenerate DESIGN.md / PRODUCT.md if the brief is
 * complete". Extracted from the server startup path so it can be tested
 * without booting a transport.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import { isBriefComplete, type Brief } from './brief.js';
import { generateBrandDocs } from './generate.js';
import { writeBrandDocs } from './write.js';

export function regenerateBrandDocsIfReady(
  index: DesignSystemIndex,
  brief: Partial<Brief> | undefined,
  outputDir: string,
): { written: boolean; reason?: string } {
  if (!isBriefComplete(brief)) {
    return { written: false, reason: 'brief-incomplete' };
  }
  writeBrandDocs(outputDir, generateBrandDocs(index, brief));
  return { written: true };
}
