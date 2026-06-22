# Brand Docs Generation (DESIGN.md + PRODUCT.md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate two write-only reference files — `DESIGN.md` and `PRODUCT.md` — from the brand atomic system plus a stored four-answer brief, runnable both on MCP server startup and via a new `sync_brand_docs` write tool, to guide coding agents that don't use the MCP.

**Architecture:** A pure, deterministic generator (`src/brand-docs/`) turns the live design system index + a `brief` (4 fields stored in `brandkit.config.yaml`) into two markdown strings, written through a delimiter-preserving writer. The server startup hook regenerates silently when the brief is complete; the `sync_brand_docs` tool collects missing answers, persists them, and writes the files. The existing `docs` CLI command is refactored onto the same generator.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), zod (config schema), js-yaml (config read/write), vitest (tests). Tools follow the existing `TOOL_NAME` / `TOOL_DESCRIPTION` / `INPUT_SCHEMA` / `handler` module pattern.

**Spec:** `docs/superpowers/specs/2026-06-22-brand-docs-design-product-generation-design.md`

---

## File Structure

- **Create** `src/brand-docs/brief.ts` — `Brief` type, the 4 questions, `isBriefComplete`, `missingBriefQuestions`, `fillBriefPlaceholders`.
- **Create** `src/brand-docs/write.ts` — delimiter constants, `updateFileWithDelimiters` (moved from docs command), `writeBrandDocs`.
- **Create** `src/brand-docs/generate.ts` — `generateBrandDocs(index, brief) → { design, product }`.
- **Create** `src/brand-docs/regenerate.ts` — `regenerateBrandDocsIfReady(index, brief, outputDir)` orchestrator (testable startup logic).
- **Create** `src/tools/sync-brand-docs.ts` — the `sync_brand_docs` MCP write tool.
- **Modify** `src/types/config.ts` — add optional `brief` block to `BrandKitConfigSchema`.
- **Modify** `src/tools/index.ts` — register the new tool, thread a `context` ({ configPath, outputDir }) through `registerAllTools`.
- **Modify** `src/index.ts` — pass context to `registerAllTools`; call `regenerateBrandDocsIfReady` on startup.
- **Modify** `src/cli/commands/docs.ts` — import the shared writer, emit `DESIGN.md` + `PRODUCT.md` via the shared generator.
- **Modify** `CLAUDE.md` — tool count 18→19, document the write tool, the brief block, the denylist.
- **Create** `src/tests/brand-docs.test.ts`, `src/tests/tools-sync-brand-docs.test.ts`; **modify** `src/tests/docs-command.test.ts`.

---

## Task 1: Config `brief` block + brief helpers

**Files:**
- Modify: `src/types/config.ts`
- Create: `src/brand-docs/brief.ts`
- Create: `src/tests/brand-docs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/brand-docs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BrandKitConfigSchema } from '../types/config.js';
import {
  isBriefComplete,
  missingBriefQuestions,
  fillBriefPlaceholders,
  BRIEF_QUESTIONS,
  BRIEF_PLACEHOLDER,
} from '../brand-docs/brief.js';

describe('config brief block', () => {
  it('parses an optional brief with four string fields', () => {
    const cfg = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Acme' },
      brief: {
        audience: 'solo founders between meetings',
        voice_words: 'warm, mechanical, opinionated',
        visual_references: 'Klim specimen pages',
        anti_references: 'generic SaaS dashboards',
      },
    });
    expect(cfg.brief?.audience).toContain('solo founders');
  });

  it('allows config with no brief', () => {
    const cfg = BrandKitConfigSchema.parse({ version: 2, brand: { name: 'Acme' } });
    expect(cfg.brief).toBeUndefined();
  });
});

describe('brief helpers', () => {
  const full = {
    audience: 'a',
    voice_words: 'b',
    visual_references: 'c',
    anti_references: 'd',
  };

  it('isBriefComplete is true only when all four are non-empty', () => {
    expect(isBriefComplete(full)).toBe(true);
    expect(isBriefComplete({ ...full, anti_references: '   ' })).toBe(false);
    expect(isBriefComplete(undefined)).toBe(false);
    expect(isBriefComplete({})).toBe(false);
  });

  it('missingBriefQuestions returns the questions for empty fields', () => {
    const missing = missingBriefQuestions({ audience: 'a' });
    expect(missing).toHaveLength(3);
    expect(missing.join(' ')).toContain('three words');
    expect(BRIEF_QUESTIONS).toHaveLength(4);
  });

  it('fillBriefPlaceholders fills only empty fields', () => {
    const filled = fillBriefPlaceholders({ audience: 'real audience' });
    expect(filled.audience).toBe('real audience');
    expect(filled.voice_words).toBe(BRIEF_PLACEHOLDER);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: FAIL — cannot find module `../brand-docs/brief.js` (and `brief` missing from schema).

- [ ] **Step 3: Add the `brief` block to the schema**

In `src/types/config.ts`, inside the `BrandKitConfigSchema` object (after the `brand` block, before `contexts`), add:

```ts
  // Human-authored creative brief. Optional; consumed only to generate
  // DESIGN.md / PRODUCT.md. Never read back as MCP input.
  brief: z
    .object({
      audience: z.string().optional(),
      voice_words: z.string().optional(),
      visual_references: z.string().optional(),
      anti_references: z.string().optional(),
    })
    .optional(),
```

- [ ] **Step 4: Create `src/brand-docs/brief.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: PASS (3 brief-helper tests + 2 schema tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/config.ts src/brand-docs/brief.ts src/tests/brand-docs.test.ts
git commit -m "feat(brand-docs): add brief config block and helpers"
```

---

## Task 2: Delimiter-preserving writer

**Files:**
- Create: `src/brand-docs/write.ts`
- Test: `src/tests/brand-docs.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/tests/brand-docs.test.ts`:

```ts
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  updateFileWithDelimiters,
  writeBrandDocs,
  DELIMITER_START,
  DELIMITER_END,
} from '../brand-docs/write.js';

describe('updateFileWithDelimiters', () => {
  it('creates a new file with a delimited block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    updateFileWithDelimiters(file, 'HELLO');
    const text = readFileSync(file, 'utf-8');
    expect(text).toContain(DELIMITER_START);
    expect(text).toContain('HELLO');
    expect(text).toContain(DELIMITER_END);
  });

  it('replaces only the delimited region, preserving outside content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    writeFileSync(
      file,
      `TOP\n${DELIMITER_START}\nOLD\n${DELIMITER_END}\nBOTTOM\n`,
      'utf-8',
    );
    updateFileWithDelimiters(file, 'NEW');
    const text = readFileSync(file, 'utf-8');
    expect(text).toContain('TOP');
    expect(text).toContain('BOTTOM');
    expect(text).toContain('NEW');
    expect(text).not.toContain('OLD');
  });

  it('appends a block when the file has no delimiters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const file = join(dir, 'DESIGN.md');
    writeFileSync(file, 'USER CONTENT\n', 'utf-8');
    updateFileWithDelimiters(file, 'GENERATED');
    const text = readFileSync(file, 'utf-8');
    expect(text).toContain('USER CONTENT');
    expect(text).toContain('GENERATED');
  });
});

describe('writeBrandDocs', () => {
  it('writes DESIGN.md and PRODUCT.md and returns their paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-write-'));
    const { designPath, productPath } = writeBrandDocs(dir, {
      design: 'D',
      product: 'P',
    });
    expect(existsSync(designPath)).toBe(true);
    expect(existsSync(productPath)).toBe(true);
    expect(readFileSync(designPath, 'utf-8')).toContain('D');
    expect(readFileSync(productPath, 'utf-8')).toContain('P');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: FAIL — cannot find module `../brand-docs/write.js`.

- [ ] **Step 3: Create `src/brand-docs/write.ts`**

```ts
/**
 * @file brand-docs/write.ts
 * @description Writes generated brand-doc blocks while preserving any human
 * content outside the delimiter markers. Shared by the startup hook, the
 * sync_brand_docs tool, and the `docs` CLI command.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export const DELIMITER_START = '<!-- brandkit-mcp:start -->';
export const DELIMITER_END = '<!-- brandkit-mcp:end -->';

/**
 * Write a generated block into a file while preserving user content outside
 * the delimiter markers.
 *
 * - File absent: create it with the delimited block.
 * - Delimiters present: replace only the delimited region.
 * - No delimiters: append the block so existing content is never lost.
 */
export function updateFileWithDelimiters(filePath: string, generatedBlock: string): void {
  const wrappedBlock = `${DELIMITER_START}\n${generatedBlock}\n${DELIMITER_END}`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, wrappedBlock + '\n', 'utf-8');
    return;
  }

  const existing = readFileSync(filePath, 'utf-8');
  const startIdx = existing.indexOf(DELIMITER_START);
  const endIdx = existing.indexOf(DELIMITER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const updated =
      existing.slice(0, startIdx) +
      wrappedBlock +
      existing.slice(endIdx + DELIMITER_END.length);
    writeFileSync(filePath, updated, 'utf-8');
  } else {
    writeFileSync(filePath, existing.trimEnd() + '\n\n' + wrappedBlock + '\n', 'utf-8');
  }
}

/** Writes DESIGN.md and PRODUCT.md into outputDir, returning their paths. */
export function writeBrandDocs(
  outputDir: string,
  docs: { design: string; product: string },
): { designPath: string; productPath: string } {
  const designPath = join(outputDir, 'DESIGN.md');
  const productPath = join(outputDir, 'PRODUCT.md');
  updateFileWithDelimiters(designPath, docs.design);
  updateFileWithDelimiters(productPath, docs.product);
  return { designPath, productPath };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brand-docs/write.ts src/tests/brand-docs.test.ts
git commit -m "feat(brand-docs): add delimiter-preserving writer"
```

---

## Task 3: Deterministic generator

**Files:**
- Create: `src/brand-docs/generate.ts`
- Test: `src/tests/brand-docs.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/tests/brand-docs.test.ts`:

```ts
import { buildFixtureIndex } from './helpers.js';
import { generateBrandDocs } from '../brand-docs/generate.js';

describe('generateBrandDocs', () => {
  const brief = {
    audience: 'solo founders between meetings',
    voice_words: 'warm, mechanical, opinionated',
    visual_references: 'Klim specimen pages; Linear changelog',
    anti_references: 'generic SaaS dashboards; Material demos',
  };

  it('puts audience + voice + verbal atoms in PRODUCT.md', () => {
    const index = buildFixtureIndex('v2/full');
    const { product } = generateBrandDocs(index, brief);
    expect(product).toContain('Product Brief');
    expect(product).toContain('solo founders between meetings');
    expect(product).toContain('warm, mechanical, opinionated');
    // verbal/positioning.md body from the fixture
    expect(product).toContain('ship marketing pages');
  });

  it('puts references + anti-references + visual atoms in DESIGN.md', () => {
    const index = buildFixtureIndex('v2/full');
    const { design } = generateBrandDocs(index, brief);
    expect(design).toContain('Design Brief');
    expect(design).toContain('Klim specimen pages');
    expect(design).toContain('generic SaaS dashboards');
    expect(design).toContain('Anti-references');
    // a visual atom: the fixture defines a Button component
    expect(design).toContain('Button');
  });

  it('does not throw and notes absence when atoms are missing (empty fixture)', () => {
    const index = buildFixtureIndex('v2/empty');
    const { design, product } = generateBrandDocs(index, brief);
    expect(product).toContain('Product Brief');
    expect(design).toContain('Design Brief');
    expect(product).toContain('Not defined in the brand atomic system');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: FAIL — cannot find module `../brand-docs/generate.js`.

- [ ] **Step 3: Create `src/brand-docs/generate.ts`**

```ts
/**
 * @file brand-docs/generate.ts
 * @description Deterministic generator that turns the design system index +
 * a complete brief into DESIGN.md and PRODUCT.md markdown. No I/O, no LLM —
 * the startup path must be reproducible without an agent in the loop.
 *
 * Split: PRODUCT.md = who & why (verbal atoms + audience + voice words).
 * DESIGN.md = how it looks (visual atoms + references + anti-references + tone).
 * Degrades gracefully: missing atoms are noted, never thrown on.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import type { MotionSystem } from '../types/design-system.js';
import type { Brief } from './brief.js';

const HEADER_NOTE =
  '> Generated by brandkit-mcp from the brand atomic system + the brief in `brandkit.config.yaml`.\n' +
  '> Edits outside the `brandkit-mcp` delimiter block are preserved; the block is overwritten on each regeneration.';

function section(title: string, body: string): string {
  const trimmed = body.trim();
  return `## ${title}\n\n${trimmed || '_Not defined in the brand atomic system._'}\n`;
}

/** Split a free-text answer on newlines/semicolons into a bullet list. */
function bullets(text: string): string {
  const items = text
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length <= 1) return text.trim();
  return items.map((i) => `- ${i}`).join('\n');
}

function renderCustomProps(props: Record<string, string>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return '';
  return [
    '| Token | Value |',
    '| --- | --- |',
    ...entries.map(([k, v]) => `| \`${k}\` | \`${v}\` |`),
  ].join('\n');
}

function renderMotion(motion: MotionSystem): string {
  const lines: string[] = [];
  if (motion.tokens && typeof motion.tokens === 'object') {
    const keys = Object.keys(motion.tokens as Record<string, unknown>);
    if (keys.length) {
      lines.push(`Motion tokens: ${keys.map((k) => `\`${k}\``).join(', ')}.`);
    }
  }
  if (typeof motion.css === 'string' && motion.css.length > 0) {
    lines.push(`Motion CSS is defined in agent/visual/motion/motion.css (${motion.css.length} chars).`);
  }
  return lines.join('\n\n');
}

function buildProduct(index: DesignSystemIndex, brief: Brief): string {
  const v = index.verbal;
  const audienceBody =
    brief.audience +
    (v.audience
      ? `\n\nFrom the brand's audience definition:\n\n\`\`\`json\n${JSON.stringify(v.audience.data, null, 2)}\n\`\`\``
      : '');
  const voiceBody =
    `In three words: **${brief.voice_words}**.` + (v.voice ? `\n\n${v.voice.body.trim()}` : '');

  return [
    `# ${index.brandName} — Product Brief`,
    '',
    HEADER_NOTE,
    '',
    section('Who this is for', audienceBody),
    section('Brand voice', voiceBody),
    section('Positioning', v.positioning?.body ?? ''),
    section('Messaging', v.messaging?.body ?? ''),
    section('Differentiation', v.differentiation?.body ?? ''),
    section('Concepts', v.concepts?.body ?? ''),
  ].join('\n');
}

function buildDesign(index: DesignSystemIndex, brief: Brief): string {
  const b = index.base;
  const colorBlock = b.colorsAndType ? renderCustomProps(b.colorsAndType.customProperties) : '';
  const fontsBlock = b.fonts.length
    ? b.fonts
        .map(
          (f) =>
            `- **${f.family}**${f.weight != null ? ` ${f.weight}` : ''}` +
            `${f.style && f.style !== 'normal' ? ` ${f.style}` : ''}`,
        )
        .join('\n')
    : '';
  const componentsBlock = b.components.length
    ? b.components
        .map(
          (c) =>
            `- **${c.name}** (${c.category})` +
            `${c.description ? ` — ${c.description}` : ''}` +
            `${c.variants?.length ? ` · variants: ${c.variants.join(', ')}` : ''}`,
        )
        .join('\n')
    : '';
  const motionBlock = b.motion ? renderMotion(b.motion) : '';

  return [
    `# ${index.brandName} — Design Brief`,
    '',
    HEADER_NOTE,
    '',
    section('Audience & tone', `The product should feel: **${brief.voice_words}**.\n\nBuilt for: ${brief.audience}`),
    section('Visual references', bullets(brief.visual_references)),
    section('Anti-references — do NOT look like these', bullets(brief.anti_references)),
    section('Color & typography tokens', colorBlock),
    section('Fonts', fontsBlock),
    section('Components', componentsBlock),
    section('Motion', motionBlock),
  ].join('\n');
}

/** Build both reference documents from the index + a complete brief. */
export function generateBrandDocs(
  index: DesignSystemIndex,
  brief: Brief,
): { design: string; product: string } {
  return { product: buildProduct(index, brief), design: buildDesign(index, brief) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: PASS. (If the empty-fixture assertion fails, confirm `v2/empty` has no verbal docs; the `section` helper emits the "_Not defined…_" sentinel for empty bodies.)

- [ ] **Step 5: Commit**

```bash
git add src/brand-docs/generate.ts src/tests/brand-docs.test.ts
git commit -m "feat(brand-docs): add deterministic DESIGN/PRODUCT generator"
```

---

## Task 4: Regeneration orchestrator (testable startup logic)

**Files:**
- Create: `src/brand-docs/regenerate.ts`
- Test: `src/tests/brand-docs.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/tests/brand-docs.test.ts`:

```ts
import { regenerateBrandDocsIfReady } from '../brand-docs/regenerate.js';

describe('regenerateBrandDocsIfReady', () => {
  const fullBrief = {
    audience: 'a',
    voice_words: 'b',
    visual_references: 'c',
    anti_references: 'd',
  };

  it('writes both files when the brief is complete', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-regen-'));
    const index = buildFixtureIndex('v2/full');
    const result = regenerateBrandDocsIfReady(index, fullBrief, dir);
    expect(result.written).toBe(true);
    expect(existsSync(join(dir, 'DESIGN.md'))).toBe(true);
    expect(existsSync(join(dir, 'PRODUCT.md'))).toBe(true);
  });

  it('skips and reports when the brief is incomplete', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-regen-'));
    const index = buildFixtureIndex('v2/full');
    const result = regenerateBrandDocsIfReady(index, { audience: 'a' }, dir);
    expect(result.written).toBe(false);
    expect(result.reason).toBe('brief-incomplete');
    expect(existsSync(join(dir, 'DESIGN.md'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: FAIL — cannot find module `../brand-docs/regenerate.js`.

- [ ] **Step 3: Create `src/brand-docs/regenerate.ts`**

```ts
/**
 * @file brand-docs/regenerate.ts
 * @description Orchestrates "regenerate DESIGN.md / PRODUCT.md if the brief is
 * complete". Extracted from the server startup path so it can be tested
 * without booting a transport.
 */

import type { DesignSystemIndex } from '../indexer/types.js';
import { isBriefComplete, type Brief } from './brief.js';
import { generateBrandDocs } from './generate.js';
import { writeBrandDocs } from './write.js';

export function regenerateBrandDocsIfReady(
  index: DesignSystemIndex,
  brief: Partial<Brief> | undefined,
  outputDir: string,
): { written: boolean; reason?: string } {
  if (!isBriefComplete(brief)) {
    return { written: false, reason: 'brief-incomplete' };
  }
  writeBrandDocs(outputDir, generateBrandDocs(index, brief));
  return { written: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/brand-docs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brand-docs/regenerate.ts src/tests/brand-docs.test.ts
git commit -m "feat(brand-docs): add regeneration orchestrator"
```

---

## Task 5: `sync_brand_docs` MCP write tool

**Files:**
- Create: `src/tools/sync-brand-docs.ts`
- Modify: `src/tools/index.ts`
- Create: `src/tests/tools-sync-brand-docs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/tools-sync-brand-docs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { handler, TOOL_NAME } from '../tools/sync-brand-docs.js';
import { buildFixtureIndex } from './helpers.js';

function setup(): { configPath: string; outputDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'bk-sync-'));
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(configPath, 'version: 2\nbrand:\n  name: Acme\n  root: ./\n', 'utf-8');
  return { configPath, outputDir: dir };
}

function parse(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

// The tool returns the content array directly (no { content } wrapper),
// matching the other tool handlers.
function call(index: ReturnType<typeof buildFixtureIndex>, args: Record<string, string>, ctx: { configPath: string; outputDir: string }) {
  return handler(index, args, ctx);
}

describe('sync_brand_docs', () => {
  it('exposes the expected tool name', () => {
    expect(TOOL_NAME).toBe('sync_brand_docs');
  });

  it('returns the missing questions and writes nothing when incomplete', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    const content = await call(index, { audience: 'solo founders' }, ctx);
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('needs_answers');
    expect((payload.questions as string[]).length).toBe(3);
    expect(existsSync(join(ctx.outputDir, 'DESIGN.md'))).toBe(false);
  });

  it('persists the brief and writes both files when complete', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    const content = await call(
      index,
      {
        audience: 'solo founders between meetings',
        voiceWords: 'warm, mechanical, opinionated',
        visualReferences: 'Klim specimen pages',
        antiReferences: 'generic SaaS dashboards',
      },
      ctx,
    );
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('written');
    expect(existsSync(join(ctx.outputDir, 'DESIGN.md'))).toBe(true);
    expect(existsSync(join(ctx.outputDir, 'PRODUCT.md'))).toBe(true);

    // brief saved back into the config file
    const savedCfg = yaml.load(readFileSync(ctx.configPath, 'utf-8')) as Record<string, any>;
    expect(savedCfg.brief.voice_words).toBe('warm, mechanical, opinionated');

    // warns about YAML comment loss
    expect((payload._warnings as string[]).join(' ')).toContain('comments');
  });

  it('merges new answers over a brief already in the config', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    writeFileSync(
      ctx.configPath,
      'version: 2\nbrand:\n  name: Acme\n  root: ./\nbrief:\n  audience: existing audience\n  voice_words: a, b, c\n  visual_references: refs\n  anti_references: antis\n',
      'utf-8',
    );
    const content = await call(index, { audience: 'updated audience' }, ctx);
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.status).toBe('written');
    const savedCfg = yaml.load(readFileSync(ctx.configPath, 'utf-8')) as Record<string, any>;
    expect(savedCfg.brief.audience).toBe('updated audience');
    expect(savedCfg.brief.anti_references).toBe('antis');
  });

  it('never writes a magic_trick.md', async () => {
    const index = buildFixtureIndex('v2/full');
    const ctx = setup();
    await call(
      index,
      {
        audience: 'a',
        voiceWords: 'b',
        visualReferences: 'c',
        antiReferences: 'd',
      },
      ctx,
    );
    expect(existsSync(join(ctx.outputDir, 'magic_trick.md'))).toBe(false);
  });

  it('reports unavailable when no config path is bound', async () => {
    const index = buildFixtureIndex('v2/full');
    const content = await handler(index, { audience: 'a' }, undefined);
    const payload = JSON.parse(content[0].text) as Record<string, unknown>;
    expect(payload.ok).toBe(false);
    expect(String(payload.error)).toContain('no config path');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/tools-sync-brand-docs.test.ts`
Expected: FAIL — cannot find module `../tools/sync-brand-docs.js`.

- [ ] **Step 3: Create `src/tools/sync-brand-docs.ts`**

```ts
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
```

- [ ] **Step 4: Register the tool in `src/tools/index.ts`**

Add the import near the other tool imports:

```ts
import * as syncBrandDocs    from './sync-brand-docs.js';
```

Add it to the `ALL_TOOLS` array (after `contextDiff`) and update the count comment to `19 tools`:

```ts
  contextDiff,
  syncBrandDocs,
] as const;
```

Add a context parameter to `registerAllTools`:

```ts
export function registerAllTools(
  server: Server,
  getIndex: () => DesignSystemIndex,
  context?: { configPath: string; outputDir: string },
): void {
```

In the `CallToolRequestSchema` switch, add a case (note `await`, since this handler is async):

```ts
        case syncBrandDocs.TOOL_NAME:    return { content: await syncBrandDocs.handler(index, args as never, context) };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/tools-sync-brand-docs.test.ts`
Expected: PASS (6 tests). Then confirm registration compiles:
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/tools/sync-brand-docs.ts src/tools/index.ts src/tests/tools-sync-brand-docs.test.ts
git commit -m "feat(tools): add sync_brand_docs write tool"
```

---

## Task 6: Wire startup hook + pass context to registration

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports to `src/index.ts`**

After the existing imports (e.g. below the `getPackageVersion` import), add:

```ts
import { regenerateBrandDocsIfReady } from './brand-docs/regenerate.js';
```

- [ ] **Step 2: Regenerate brand docs on startup**

In `startServer`, immediately after the index-built log line
(`console.error(\`[brandkit-mcp] Indexed ...\`);`) and before `const server = new Server(`, add:

```ts
  // Regenerate the DESIGN.md / PRODUCT.md reference files for non-MCP coding
  // agents. Written next to brandkit.config.yaml. The MCP never reads these
  // files back as input. Never blocks startup.
  try {
    const result = regenerateBrandDocsIfReady(currentIndex, config.brief, configDir);
    if (result.written) {
      console.error('[brandkit-mcp] Regenerated DESIGN.md and PRODUCT.md');
    } else {
      console.error(
        '[brandkit-mcp] Brief incomplete — run the sync_brand_docs tool to generate DESIGN.md / PRODUCT.md',
      );
    }
  } catch (err) {
    console.error(
      '[brandkit-mcp] Failed to regenerate brand docs:',
      err instanceof Error ? err.message : String(err),
    );
  }
```

- [ ] **Step 3: Pass context into both `registerAllTools` call sites**

The stdio/top-level registration (around line 63):

```ts
  registerAllTools(server, () => currentIndex, { configPath: filePath, outputDir: configDir });
```

The SSE per-session registration (inside `app.get('/sse', ...)`):

```ts
        registerAllTools(sessionServer, () => currentIndex, { configPath: filePath, outputDir: configDir });
```

(`filePath` and `configDir` are already in scope in `startServer`.)

- [ ] **Step 4: Verify build + full test suite**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: all tests pass (including the existing suite — the new optional `context` param is backward compatible for any adapter that omits it).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(server): regenerate brand docs on startup and bind tool context"
```

---

## Task 7: Refactor the `docs` CLI command onto the shared generator

**Files:**
- Modify: `src/cli/commands/docs.ts`
- Modify: `src/cli/index.ts` (command description)
- Modify: `src/tests/docs-command.test.ts`

- [ ] **Step 1: Update the failing test**

In `src/tests/docs-command.test.ts`, add an assertion to the existing test (after the CLAUDE.md check):

```ts
    expect(existsSync(join(outDir, 'DESIGN.md'))).toBe(true);
    expect(existsSync(join(outDir, 'PRODUCT.md'))).toBe(true);
    const product = readFileSync(join(outDir, 'PRODUCT.md'), 'utf-8');
    expect(product).toContain('PathTest — Product Brief');
```

Add `existsSync` to the `fs` import at the top of that test file:

```ts
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/docs-command.test.ts`
Expected: FAIL — `DESIGN.md` lacks the new "Product Brief"/Stitch format and `PRODUCT.md` does not exist yet.

- [ ] **Step 3: Refactor `src/cli/commands/docs.ts`**

Replace the local delimiter helper and the DESIGN.md block:

1. Delete the local `DELIMITER_START`, `DELIMITER_END`, and `updateFileWithDelimiters` definitions (lines 17–53).
2. Add imports near the top:

```ts
import { updateFileWithDelimiters, writeBrandDocs } from '../../brand-docs/write.js';
import { generateBrandDocs } from '../../brand-docs/generate.js';
import { fillBriefPlaceholders } from '../../brand-docs/brief.js';
```

3. Delete the old DESIGN.md generation block (the `tokenSummary` / `componentSummary` / `assetSummary` / `designBlock` lines and its `updateFileWithDelimiters(join(outputDir, 'DESIGN.md'), designBlock)` call).
4. In its place, after the SKILLS.md write, add:

```ts
  // DESIGN.md + PRODUCT.md via the shared generator (single source of truth).
  // Empty brief fields render as a placeholder pointing at sync_brand_docs.
  const brief = fillBriefPlaceholders(config.brief);
  writeBrandDocs(outputDir, generateBrandDocs(index, brief));
  console.log('[OK] Generated DESIGN.md');
  console.log('[OK] Generated PRODUCT.md');
```

(The CLAUDE.md / AGENTS.md / SKILLS.md generation above is unchanged; they now call the imported `updateFileWithDelimiters`.)

- [ ] **Step 4: Update the command description**

In `src/cli/index.ts`, update the `docs` command description string:

```ts
  .description('Generate project documentation files (CLAUDE.md, AGENTS.md, SKILLS.md, DESIGN.md, PRODUCT.md)')
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/docs-command.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/docs.ts src/cli/index.ts src/tests/docs-command.test.ts
git commit -m "refactor(docs): emit DESIGN.md + PRODUCT.md via shared generator"
```

---

## Task 8: Update CLAUDE.md conventions

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the tool-count references**

In `CLAUDE.md`, change the "Tool Surface (18 tools)" heading to "Tool Surface (19 tools)" and the `src/tools/ # 18 MCP tools` comment in the source-layout block to `# 19 MCP tools`.

- [ ] **Step 2: Add the new tool to the tool table**

In the tool table, add a row at the end:

```markdown
| `sync_brand_docs` | Generate/update DESIGN.md + PRODUCT.md from the brand + a 4-answer brief (write tool) |
```

- [ ] **Step 3: Update the write-tool convention**

Replace the first sentence of the **"Never write to `magic_trick.md`"** convention paragraph so it reflects reality:

```markdown
**Never write to `magic_trick.md`.** This file is human-authored. The MCP
exposes exactly one write tool today (`sync_brand_docs`), which writes only
`brandkit.config.yaml`, `DESIGN.md`, and `PRODUCT.md`. `magic_trick.md` MUST
remain on the write denylist.
```

- [ ] **Step 4: Document the brief + generated files**

Add a new convention paragraph after the "`human/` is ignored." paragraph:

```markdown
**Brief drives DESIGN.md / PRODUCT.md.** An optional `brief:` block in
`brandkit.config.yaml` (`audience`, `voice_words`, `visual_references`,
`anti_references`) is combined with the brand atomic system to generate two
write-only reference files at the project root: `PRODUCT.md` (who & why, from
the verbal atoms) and `DESIGN.md` (how it looks, from the visual atoms). They
guide coding agents that are NOT using the MCP. The MCP never reads them back
as input. They are regenerated on server startup (when the brief is complete)
and by the `sync_brand_docs` tool, which asks for any missing answers first.
```

- [ ] **Step 5: Verify and commit**

Run: `npm test`
Expected: all tests pass.
Run: `npm run lint`
Expected: no errors.

```bash
git add CLAUDE.md
git commit -m "docs(claude): document sync_brand_docs tool and brief block"
```

---

## Self-Review

**Spec coverage:**
- Trigger model (tool + stored brief, silent startup regen) → Tasks 5, 6. ✓
- Config `brief` block → Task 1. ✓
- Deterministic generator, PRODUCT/DESIGN split + input mapping → Task 3. ✓
- Shared delimiter-preserving writer, output dir = config dir → Tasks 2, 6. ✓
- `sync_brand_docs` returns questions when incomplete; persists + writes when complete; YAML-comment-loss warning; never writes magic_trick → Task 5. ✓
- Startup hook, all transports, non-blocking → Task 6 (top-level + SSE call sites both updated; HTTP path reuses the top-level `server`). ✓
- Refactor `docs` command to one DESIGN.md format + add PRODUCT.md → Task 7. ✓
- CLAUDE.md update (count 18→19, write tool, denylist, brief) → Task 8. ✓
- Tolerance principle (no throw on missing atoms; `_warnings`) → Task 3 `section` sentinel + Task 5 `_warnings`. ✓
- Tests for generator, completeness gating, delimiter preservation, tool paths, startup → Tasks 1–7. ✓

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" — every code step has complete code. The spec's one open item ("thread the config file path into tool registration") is resolved concretely in Task 5 Step 4 / Task 6 Step 3.

**Type consistency:** `Brief` fields (`audience`, `voice_words`, `visual_references`, `anti_references`) are identical across `brief.ts`, the config schema, the generator, and the tool's `merged` object. The tool maps camelCase args (`voiceWords`) to snake_case `Brief` fields explicitly. `generateBrandDocs(index, brief)`, `writeBrandDocs(outputDir, {design,product})`, `regenerateBrandDocsIfReady(index, brief, outputDir)`, and `registerAllTools(server, getIndex, context)` signatures match every call site. `MotionSystem` imported as a type for `renderMotion`.

**Out of scope (unchanged):** LLM prose, per-context doc variants, MCP elicitation, honoring `config.contexts`.
