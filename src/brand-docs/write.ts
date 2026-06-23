/**
 * @file brand-docs/write.ts
 * @description Writes generated brand-doc blocks while preserving any human
 * content outside the delimiter markers. Shared by the startup hook, the
 * sync_brand_docs tool, and the `docs` CLI command.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export const DELIMITER_START = '<!-- brandkit-mcp:start -->';
export const DELIMITER_END = '<!-- brandkit-mcp:end -->';

/**
 * Write a generated block into a file while preserving user content outside
 * the delimiter markers.
 *
 * - File absent: create it with the delimited block.
 * - Delimiters present: replace only the delimited region.
 * - No delimiters: append the block so existing content is never lost.
 */
export function updateFileWithDelimiters(filePath: string, generatedBlock: string): void {
  const wrappedBlock = `${DELIMITER_START}\n${generatedBlock}\n${DELIMITER_END}`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, wrappedBlock + '\n', 'utf-8');
    return;
  }

  const existing = readFileSync(filePath, 'utf-8');
  const startIdx = existing.indexOf(DELIMITER_START);
  const endIdx = existing.indexOf(DELIMITER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const updated =
      existing.slice(0, startIdx) +
      wrappedBlock +
      existing.slice(endIdx + DELIMITER_END.length);
    writeFileSync(filePath, updated, 'utf-8');
  } else {
    writeFileSync(filePath, existing.trimEnd() + '\n\n' + wrappedBlock + '\n', 'utf-8');
  }
}

/** Writes DESIGN.md and PRODUCT.md into outputDir, returning their paths. */
export function writeBrandDocs(
  outputDir: string,
  docs: { design: string; product: string },
): { designPath: string; productPath: string } {
  const designPath = join(outputDir, 'DESIGN.md');
  const productPath = join(outputDir, 'PRODUCT.md');
  updateFileWithDelimiters(designPath, docs.design);
  updateFileWithDelimiters(productPath, docs.product);
  return { designPath, productPath };
}
