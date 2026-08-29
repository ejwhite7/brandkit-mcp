/**
 * @file version.ts
 * @description Single source of truth for the package version at runtime.
 * Walks up from the compiled module location looking for package.json so it
 * works from src/ (vitest), dist/ (tsup output), and bundled CLI layouts.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function getPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, '../package.json'),
      join(here, '../../package.json'),
      join(here, '../../../package.json'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        try {
          return JSON.parse(readFileSync(c, 'utf-8')).version as string;
        } catch {
          // unreadable/corrupt candidate; try the next one
        }
      }
    }
  } catch {
    // import.meta.url unavailable in unusual runtimes
  }
  return '0.0.0';
}
