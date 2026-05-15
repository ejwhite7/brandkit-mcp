import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_voice';

export const TOOL_DESCRIPTION =
  "Return the brand's voice document (agent/verbal/voice.md). Includes a taste primer.";

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function handler(index: DesignSystemIndex) {
  const doc = index.verbal.voice;
  const warnings: string[] = [];

  if (!doc) {
    warnings.push('No voice document found at agent/verbal/voice.md');
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
