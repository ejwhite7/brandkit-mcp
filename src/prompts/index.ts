/**
 * @file prompts/index.ts
 * @description MCP Prompts exposed by the BrandKit server.
 *
 * Prompts are reusable, parameterized message templates that surface in
 * MCP-compatible clients (e.g. Claude Desktop's slash menu) so users can
 * invoke common brand-aware workflows in one click.
 */

import type { DesignSystemIndex } from '../indexer/types.js';

interface PromptArg {
  name: string;
  description: string;
  required?: boolean;
}

interface PromptDescriptor {
  name: string;
  description: string;
  arguments?: PromptArg[];
}

const PROMPTS: PromptDescriptor[] = [
  {
    name: 'design-with-brand',
    description: 'Build a UI feature using the brand design system. Auto-injects colors, typography, and component conventions for the given context.',
    arguments: [
      { name: 'feature', description: 'What you want to build (e.g. "pricing page hero")', required: true },
      { name: 'context', description: 'base | web | product', required: false },
    ],
  },
  {
    name: 'audit-brand-compliance',
    description: 'Audit a snippet of CSS/HTML/JSX for brand compliance. Flags non-brand colors, fonts, and unapproved asset usage.',
    arguments: [
      { name: 'snippet', description: 'The code to audit', required: true },
      { name: 'context', description: 'base | web | product', required: false },
    ],
  },
  {
    name: 'generate-tailwind-theme',
    description: 'Generate a Tailwind v3 / v4 theme extension that mirrors the current brand tokens.',
    arguments: [
      { name: 'context', description: 'base | web | product', required: false },
    ],
  },
  {
    name: 'explain-brand-decision',
    description: 'Explain how a particular brand-system rule should be applied for a given scenario.',
    arguments: [
      { name: 'topic', description: 'e.g. "logo on photography", "error states", "headline hierarchy"', required: true },
    ],
  },
];

export function listPrompts(): PromptDescriptor[] {
  return PROMPTS;
}

export function getPrompt(
  name: string,
  args: Record<string, string>,
  index: DesignSystemIndex,
): { description?: string; messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> } {
  const ctx = args.context ?? 'base';
  const brandName = index.brandName;

  // Get color custom properties from the appropriate context for hints
  const ctxData = ctx === 'web' ? index.web
                : ctx === 'product' ? index.product
                : index.base;
  const customProps = ctxData.colorsAndType?.customProperties ?? index.base.colorsAndType?.customProperties ?? {};
  const colorHints = Object.entries(customProps)
    .filter(([k]) => k.startsWith('--color'))
    .slice(0, 20)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '(none)';

  switch (name) {
    case 'design-with-brand': {
      const feature = args.feature ?? 'a new UI feature';
      const text = `You are designing **${feature}** using the ${brandName} brand system (context: ${ctx}).

Use the get_colors_and_type, get_components, get_voice, and get_tokens tools as needed.

Color custom properties (top 20):
${colorHints}

Constraints:
- Use only brand-approved colors, fonts, and component patterns.
- Match the tone defined by the brand voice (get_voice).
- Call validate_usage to confirm any color/font/asset before finalizing.

Now produce the implementation (HTML + CSS or JSX + Tailwind) for: ${feature}.`;
      return {
        description: `Design ${feature} with the ${brandName} brand system`,
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }

    case 'audit-brand-compliance': {
      const snippet = args.snippet ?? '';
      const text = `Audit the following code for brand compliance against the ${brandName} design system (context: ${ctx}).

Color custom properties (top 20):
${colorHints}

For each issue found, report:
1. The offending line/value
2. Why it violates the brand
3. The closest approved replacement (use validate_usage to verify)

Code:
\`\`\`
${snippet}
\`\`\``;
      return {
        description: 'Audit code for brand compliance',
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }

    case 'generate-tailwind-theme': {
      const text = `Use the get_tokens tool with context="${ctx}" to retrieve the current ${brandName} token specimens, then format them as a complete Tailwind v3 theme extension and a Tailwind v4 \`@theme\` block. Also call get_colors_and_type with context="${ctx}" for the CSS custom properties.`;
      return {
        description: 'Generate Tailwind theme from brand tokens',
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }

    case 'explain-brand-decision': {
      const topic = args.topic ?? 'general usage';
      const text = `Using the get_voice, get_positioning, and search_brand tools, explain how the ${brandName} brand system handles: **${topic}**.

Cite the specific document(s) you reference, summarize the rule in one sentence, then give a worked example.`;
      return {
        description: `Explain brand decision: ${topic}`,
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
