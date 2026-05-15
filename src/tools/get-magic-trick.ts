import type { DesignSystemIndex } from '../indexer/types.js';

export const TOOL_NAME = 'get_magic_trick';

export const TOOL_DESCRIPTION =
  'Return the human-authored magic_trick.md taste primer verbatim. This file is human-write-only — never write to it via any tool.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function handler(index: DesignSystemIndex) {
  const warnings: string[] = [];
  const mt = index.magicTrick;
  if (!mt) warnings.push('No magic_trick.md found at brand root.');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          content: mt?.content ?? '',
          source: mt?.source,
          _warnings: warnings,
        },
        null,
        2,
      ),
    },
  ];
}
