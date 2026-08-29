import { loadSafeYaml } from './safe-yaml.js';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
}

interface FrontmatterEnvelope {
  header: string | undefined;
  content: string;
}

function splitFrontmatter(source: string): FrontmatterEnvelope {
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const opening = /^---[\t ]*(?:\r?\n|$)/.exec(input);
  if (!opening) return { header: undefined, content: input };

  const headerStart = opening[0].length;
  const closingPattern = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/gm;
  closingPattern.lastIndex = headerStart;
  const closing = closingPattern.exec(input);
  if (!closing) return { header: undefined, content: input };

  return {
    header: input.slice(headerStart, closing.index),
    content: input.slice(closing.index + closing[0].length),
  };
}

/** Return the markdown body even when its YAML header cannot be parsed safely. */
export function frontmatterBody(source: string): string {
  return splitFrontmatter(source).content;
}

/**
 * Parse conventional YAML frontmatter without pulling in gray-matter's stale
 * js-yaml 3.x dependency. A document must begin with `---` and end its header
 * with a line containing `---` or the YAML document terminator `...`.
 */
export function parseFrontmatter(source: string): FrontmatterResult {
  const envelope = splitFrontmatter(source);
  if (envelope.header === undefined) return { data: {}, content: envelope.content };

  const parsed = loadSafeYaml(envelope.header);
  const data = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};

  return {
    data,
    content: envelope.content,
  };
}
