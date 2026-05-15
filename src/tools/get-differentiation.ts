import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_differentiation';

export const TOOL_DESCRIPTION =
  "Return the brand's differentiation document (agent/verbal/differentiation.md). Includes a taste primer.";

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function handler(index: DesignSystemIndex) {
  const doc = index.verbal.differentiation;
  const warnings: string[] = [];

  if (!doc) {
    warnings.push('No differentiation document found at agent/verbal/differentiation.md');
  }

  const payload = attachTastePrimer(
    {
      content: doc?.body ?? '',
      frontmatter: doc?.frontmatter ?? {},
      source: doc?.source,
      _warnings: warnings,
    },
    index,
  );

  return [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }];
}
