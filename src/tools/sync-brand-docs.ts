/**
 * @file tools/sync-brand-docs.ts
 * @description MCP tool: sync_brand_docs — the server's only write tool.
 * Collects the four-answer brief (asking for any missing answers), persists it
 * into brandkit.config.yaml, and writes DESIGN.md + PRODUCT.md. It only ever
 * writes brandkit.config.yaml, DESIGN.md, and PRODUCT.md — never magic_trick.md.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import yaml from 'js-yaml';
import type { DesignSystemIndex } from '../indexer/types.js';
import {
  isBriefComplete,
  missingBriefQuestions,
  type Brief,
} from '../brand-docs/brief.js';
import { generateBrandDocs } from '../brand-docs/generate.js';
import { writeBrandDocs } from '../brand-docs/write.js';

export const TOOL_NAME = 'sync_brand_docs';

export const TOOL_DESCRIPTION =
  'Generate or update DESIGN.md and PRODUCT.md from the brand atomic system plus a four-answer brief ' +
  '(audience, voiceWords, visualReferences, antiReferences). Any missing answers are returned as questions to ask the user. ' +
  'When all four are present they are saved into brandkit.config.yaml and both files are written. ' +
  'This is the only brandkit-mcp tool that writes files; it never writes magic_trick.md.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    audience: { type: 'string', description: 'Who the product is for. Be specific.' },
    voiceWords: { type: 'string', description: 'Brand voice in three real words.' },
    visualReferences: {
      type: 'string',
      description: 'Named visual references (brands, products, printed objects), not adjectives.',
    },
    antiReferences: {
      type: 'string',
      description: 'Named things the product must NOT look like.',
    },
  },
};

/** Bound at registration time so the tool knows where to read/write. */
export interface SyncContext {
  configPath: string;
  outputDir: string;
}

interface SyncArgs {
  audience?: string;
  voiceWords?: string;
  visualReferences?: string;
  antiReferences?: string;
}

function pick(next: string | undefined, prev: string | undefined): string | undefined {
  const n = typeof next === 'string' ? next.trim() : '';
  if (n) return n;
  return prev;
}

function text(payload: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }];
}

export async function handler(
  index: DesignSystemIndex,
  args: SyncArgs,
  context?: SyncContext,
) {
  const warnings: string[] = [];

  if (!context?.configPath) {
    return text({
      ok: false,
      error:
        'sync_brand_docs is unavailable: no config path is bound to this server session (e.g. a stateless serverless adapter).',
      _warnings: warnings,
    });
  }

  // Load any existing brief from the config file.
  let raw: Record<string, unknown> = {};
  try {
    raw = (yaml.load(readFileSync(context.configPath, 'utf-8')) as Record<string, unknown>) ?? {};
  } catch (err) {
    warnings.push(
      `Could not read existing config at ${context.configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const existing = (raw.brief as Partial<Brief> | undefined) ?? {};

  const merged: Partial<Brief> = {
    audience: pick(args.audience, existing.audience),
    voice_words: pick(args.voiceWords, existing.voice_words),
    visual_references: pick(args.visualReferences, existing.visual_references),
    anti_references: pick(args.antiReferences, existing.anti_references),
  };

  if (!isBriefComplete(merged)) {
    return text({
      ok: false,
      status: 'needs_answers',
      message:
        'The brief is incomplete. Ask the user the following questions, then call sync_brand_docs again with the answers.',
      questions: missingBriefQuestions(merged),
      _warnings: warnings,
    });
  }

  // Persist the brief back into brandkit.config.yaml (re-serializes the file,
  // dropping any comments / custom formatting).
  let savedConfig = false;
  try {
    raw.brief = merged;
    writeFileSync(context.configPath, yaml.dump(raw), 'utf-8');
    savedConfig = true;
    warnings.push(
      'Saved the brief into brandkit.config.yaml. Note: rewriting the YAML drops any comments or custom formatting in that file.',
    );
  } catch (err) {
    warnings.push(
      `Could not write brief to config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const outputDir = context.outputDir || dirname(context.configPath);
  const { designPath, productPath } = writeBrandDocs(outputDir, generateBrandDocs(index, merged));

  return text({
    ok: true,
    status: 'written',
    savedConfig,
    files: [designPath, productPath],
    brief: merged,
    _warnings: warnings,
  });
}
