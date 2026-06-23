/**
 * @file brand-docs/brief.ts
 * @description The four-answer creative brief that, combined with the brand
 * atomic system, produces DESIGN.md and PRODUCT.md. Pure data + helpers.
 */

export interface Brief {
  audience: string;
  voice_words: string;
  visual_references: string;
  anti_references: string;
}

/** The four questions, in order, paired with the brief field they fill. */
export const BRIEF_QUESTIONS: { field: keyof Brief; question: string }[] = [
  {
    field: 'audience',
    question:
      'Who is this product for? Be specific. Not "users" but "solo founders evaluating a new tool on their phone between meetings".',
  },
  {
    field: 'voice_words',
    question:
      'What is the brand voice in three words? Pick real words. "Warm and mechanical and opinionated" is better than "modern and clean".',
  },
  {
    field: 'visual_references',
    question:
      'Any visual references? Named brands, products, or printed objects, not adjectives. "Klim Type Foundry specimen pages", not "technical and clean".',
  },
  {
    field: 'anti_references',
    question:
      'Anti-references? Things the product should explicitly not look like, equally named.',
  },
];

export const BRIEF_PLACEHOLDER = '_Not provided yet — run the sync_brand_docs MCP tool._';

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True only when all four brief fields are present and non-empty. */
export function isBriefComplete(brief: Partial<Brief> | undefined): brief is Brief {
  if (!brief) return false;
  return BRIEF_QUESTIONS.every(({ field }) => hasText(brief[field]));
}

/** Questions for the fields that are still missing/empty. */
export function missingBriefQuestions(brief: Partial<Brief> | undefined): string[] {
  return BRIEF_QUESTIONS.filter(({ field }) => !hasText(brief?.[field])).map((q) => q.question);
}

/** Returns a complete Brief, substituting a placeholder for any empty field. */
export function fillBriefPlaceholders(brief: Partial<Brief> | undefined): Brief {
  const b = brief ?? {};
  const f = (v?: string): string => (hasText(v) ? v.trim() : BRIEF_PLACEHOLDER);
  return {
    audience: f(b.audience),
    voice_words: f(b.voice_words),
    visual_references: f(b.visual_references),
    anti_references: f(b.anti_references),
  };
}
