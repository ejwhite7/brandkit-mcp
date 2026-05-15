import type { DesignSystemIndex } from '../indexer/types.js';

export function attachTastePrimer<T extends object>(
  payload: T,
  index: DesignSystemIndex,
): T & { _taste_primer: string | null } {
  return {
    ...payload,
    _taste_primer: index.magicTrick?.content ?? null,
  };
}
