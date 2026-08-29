import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scanBrandRoot } from '../scanner/directory-scanner.js';
import { materializeAll, resolveContexts } from '../context-resolver.js';
import type { DesignSystemIndex } from '../indexer/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildFixtureIndex(name: 'v2/full' | 'v2/empty'): DesignSystemIndex {
  const root = resolve(__dirname, '../..', '__test_fixtures__', name);
  const scan = scanBrandRoot(root);
  const contexts = resolveContexts(scan);
  const resolved = materializeAll(contexts, { brandName: 'Test Brand' });
  return {
    brandName: 'Test Brand',
    brandRoot: root,
    lastIndexed: new Date('2026-05-14T00:00:00Z'),
    magicTrick: scan.magicTrick,
    verbal: scan.verbal,
    base: scan.base,
    web: scan.web,
    product: scan.product,
    contexts,
    resolved,
    warnings: scan.warnings,
  };
}
