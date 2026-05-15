import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_messaging';

export const TOOL_DESCRIPTION =
  "Return the brand's messaging document (agent/verbal/messaging.md). Includes a taste primer.";

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function handler(index: DesignSystemIndex) {
  const doc = index.verbal.messaging;
  const warnings: string[] = [];

  if (!doc) {
    warnings.push('No messaging document found at agent/verbal/messaging.md');
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
