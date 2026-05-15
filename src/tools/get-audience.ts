import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_audience';

export const TOOL_DESCRIPTION =
  "Return the brand's audience definition parsed from agent/verbal/audience.yaml. Freeform YAML; returned as-is. Includes a taste primer.";

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function handler(index: DesignSystemIndex) {
  const warnings: string[] = [];
  const doc = index.verbal.audience;
  if (!doc) warnings.push('No audience document found at agent/verbal/audience.yaml');

  const payload = attachTastePrimer(
    {
      data: doc?.data ?? null,
      source: doc?.source,
      _warnings: warnings,
    },
    index,
  );
  return [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }];
}
