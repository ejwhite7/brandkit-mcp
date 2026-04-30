/**
 * @file validate-usage.ts
 * @description MCP tool: validate_usage
 * Validates whether a specific color, font, or logo usage complies with
 * the brand guidelines. Returns pass/fail with specific guidance.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { ValidateUsageArgs } from '../types/mcp.js';

export const TOOL_NAME = 'validate_usage';

export const TOOL_DESCRIPTION =
  'Validate whether a specific color, font, or logo usage complies with the brand guidelines. Returns pass/fail with specific guidance.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    type: { type: 'string', enum: ['color', 'font', 'logo'], description: 'What to validate' },
    value: { type: 'string', description: 'The color hex/name, font name, or logo variant to validate' },
    context: { type: 'string', enum: ['marketing', 'product'], description: 'Context to validate against' },
    useCase: { type: 'string', description: "Description of how it's being used" },
  },
  required: ['type', 'value'],
};

/**
 * Handles the validate_usage tool call.
 */
export function handler(index: DesignSystemIndex, args: ValidateUsageArgs) {
  const resolved = args.context === 'marketing' ? index.resolved.marketing :
    args.context === 'product' ? index.resolved.product :
    index.resolved.all;

  const result: { valid: boolean; messages: string[] } = { valid: true, messages: [] };

  switch (args.type) {
    case 'color': {
      const valueLower = args.value.toLowerCase();
      const match = resolved.colors.find(
        (c) => c.value.toLowerCase() === valueLower ||
               c.hex?.toLowerCase() === valueLower ||
               c.name.toLowerCase() === valueLower ||
               c.token.toLowerCase() === valueLower,
      );

      if (match) {
        result.messages.push(`Color "${args.value}" matches brand color: ${match.name} (${match.token}: ${match.value})`);
        if (match.role) result.messages.push(`Semantic role: ${match.role}`);
        if (match.usage) result.messages.push(`Usage: ${match.usage}`);
      } else {
        result.valid = false;
        result.messages.push(`Color "${args.value}" is not part of the brand palette.`);
        result.messages.push('Approved brand colors:');
        for (const c of resolved.colors.slice(0, 10)) {
          result.messages.push(`  - ${c.name}: ${c.value} (${c.token})`);
        }
      }
      break;
    }

    case 'font': {
      const valueLower = args.value.toLowerCase();
      const familyMatch = resolved.typography.find(
        (t) => t.fontFamily?.toLowerCase().includes(valueLower),
      );
      const fontMatch = resolved.fonts.find(
        (f) => f.family.toLowerCase().includes(valueLower),
      );

      if (familyMatch || fontMatch) {
        result.messages.push(`Font "${args.value}" is approved for use in the brand.`);
        if (familyMatch?.usage) result.messages.push(`Usage: ${familyMatch.usage}`);
      } else {
        result.valid = false;
        result.messages.push(`Font "${args.value}" is not part of the brand type system.`);
        const families = [...new Set(resolved.typography.filter((t) => t.fontFamily).map((t) => t.fontFamily))];
        if (families.length > 0) {
          result.messages.push('Approved font families: ' + families.join(', '));
        }
      }
      break;
    }

    case 'logo': {
      const valueLower = args.value.toLowerCase();
      const variant = resolved.logos.variants.find(
        (v) => v.name.toLowerCase().includes(valueLower),
      );

      if (variant) {
        result.messages.push(`Logo variant "${variant.name}" exists (${variant.format}, ${variant.width ?? '?'}x${variant.height ?? '?'}px).`);
        if (resolved.logos.minimumSize) result.messages.push(`Minimum size: ${resolved.logos.minimumSize}`);
        if (resolved.logos.clearSpace) result.messages.push(`Clear space: ${resolved.logos.clearSpace}`);
        if (resolved.logos.forbiddenUsage?.length) {
          result.messages.push('Forbidden usage: ' + resolved.logos.forbiddenUsage.join('; '));
        }
      } else {
        result.valid = false;
        result.messages.push(`Logo variant "${args.value}" not found.`);
        const available = resolved.logos.variants.map((v) => v.name);
        result.messages.push('Available variants: ' + (available.length > 0 ? available.join(', ') : 'none'));
      }
      break;
    }
  }

  return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }];
}

