import { load } from 'js-yaml';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
}

/**
 * Parse conventional YAML frontmatter without pulling in gray-matter's stale
 * js-yaml 3.x dependency. A document must begin with `---` and end its header
 * with a line containing `---` or the YAML document terminator `...`.
 */
export function parseFrontmatter(source: string): FrontmatterResult {
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const opening = /^---[\t ]*(?:\r?\n|$)/.exec(input);
  if (!opening) return { data: {}, content: input };

  const headerStart = opening[0].length;
  const closingPattern = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/gm;
  closingPattern.lastIndex = headerStart;
  const closing = closingPattern.exec(input);
  if (!closing) return { data: {}, content: input };

  const parsed = load(input.slice(headerStart, closing.index));
  const data = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};

  return {
    data,
    content: input.slice(closing.index + closing[0].length),
  };
}
