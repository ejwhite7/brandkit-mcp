# Bug Fix Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 19 verified bugs found in the 2026-06-09 codebase review: tolerance-principle violations, malformed tool output, broken SSE adapters, hot-reload races, stale version strings, and CLI path-resolution bugs.

**Architecture:** All fixes are surgical changes to existing modules — no new subsystems. Two small new shared modules are introduced: `src/version.ts` (single source for the package version) and `src/tools/_context.ts` (runtime context-argument coercion, mirroring the existing `src/tools/_taste-primer.ts` pattern). The dead `src/formatters/` modules are replaced by one `token-formatters.ts` consolidating the implementations currently inlined in `get-tokens.ts`.

**Tech Stack:** TypeScript, vitest, zod, @modelcontextprotocol/sdk, chokidar, commander, js-yaml, gray-matter.

**Verification commands:** `npm test` (112 tests currently pass), `npm run typecheck`, `npm run lint`. All three must pass after every task.

**Test fixtures:** `__test_fixtures__/v2/full` and `__test_fixtures__/v2/empty` at repo root, loaded via `buildFixtureIndex(name)` from `src/tests/helpers.ts`.

---

## Decisions locked during planning

- **`colorsAndType` wholesale override is NOT a bug.** The design spec (`docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md`, "Path-level rules") says override files "shadow base files by exact relative path match". One file = whole-file shadowing. No change.
- **`getPrompt` throwing on unknown prompt names is acceptable.** The MCP SDK's request-handler layer converts handler exceptions into JSON-RPC error responses; this is the protocol-correct way to reject a malformed `prompts/get`. No change.
- **Preview v2 template rewrite is out of scope.** The `preview` CLI command is intentionally disabled with a clear message (`src/cli/index.ts:75-89`). This plan only hardens `renderPage` against EJS render exceptions (Task 19). The full v2 rewrite remains a separate tracked project.
- **`config.contexts` stays a no-op but gets documented as reserved** (Task 13). Honoring it would change the `DesignSystemIndex` shape; removing it would break configs that `init` itself generates.
- **Object aliasing across resolved contexts** (`context-resolver.ts` sharing token/asset references between base/web/product): deferred. All current consumers are read-only. Revisit if write tools ever land.

---

### Task 1: verbal-parser — never throw on malformed frontmatter

A single malformed YAML frontmatter block in any verbal doc (`positioning.md`, `voice.md`, …) makes `gray-matter` throw a `YAMLException`, which propagates unguarded out of `parseVerbalLayer` → `scanBrandRoot` and aborts the entire scan. Violates the tolerance principle.

**Files:**
- Modify: `src/parsers/verbal-parser.ts:23`
- Test: `src/tests/verbal-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the existing `describe('parseVerbalDoc', ...)` block in `src/tests/verbal-parser.test.ts` (the file already has an `md()` tempfile helper at the top — reuse it):

```ts
  it('degrades gracefully on malformed frontmatter (tolerance principle)', () => {
    const path = md('---\nbad: : :\n---\n# Positioning\n\nBody text survives.\n');
    const doc = parseVerbalDoc(path);
    expect(doc).toBeDefined();
    expect(doc?.frontmatter).toEqual({});
    expect(doc?.body).toContain('Body text survives');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/verbal-parser.test.ts`
Expected: FAIL — the new test throws `YAMLException` (or similar gray-matter parse error).

- [ ] **Step 3: Implement the fix**

In `src/parsers/verbal-parser.ts`, replace line 23 (`const { data, content } = matter(raw);`) and the return with:

```ts
  // Tolerance principle: malformed frontmatter must not abort the scan.
  // Fall back to treating the whole file as body with empty frontmatter.
  let data: Record<string, unknown> = {};
  let content = raw;
  try {
    const parsed = matter(raw);
    data = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch {
    // keep defaults: empty frontmatter, full raw body
  }
  return {
    frontmatter: data,
    body: content.trim(),
    source: path,
  };
```

Note: the malformed-frontmatter fallback keeps the raw `---` delimiter lines in `body`. That is acceptable — content is preserved, nothing crashes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/verbal-parser.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/verbal-parser.ts src/tests/verbal-parser.test.ts
git commit -m "fix(parsers): never throw on malformed verbal frontmatter"
```

---

### Task 2: get_tokens — format-aware warning injection (broken JSON fix)

`get-tokens.ts:94-97` prepends a `/* ... */` CSS comment to *every* non-json format, but `tailwind` and `w3c` formats emit JSON documents. Any warning (e.g. empty token set) produces unparseable JSON.

**Files:**
- Modify: `src/tools/get-tokens.ts:94-97`
- Test: `src/tests/tools-visual.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/tools-visual.test.ts` (it already imports `* as tokens from '../tools/get-tokens.js'` and `buildFixtureIndex`):

```ts
describe('get_tokens warning injection per format', () => {
  it('returns valid JSON for tailwind format when warnings exist', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'tailwind' });
    const parsed = JSON.parse(result.text); // must not throw
    expect(parsed._warnings).toContain('No token specimens found');
  });

  it('returns valid JSON for w3c format when warnings exist', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'w3c' });
    const parsed = JSON.parse(result.text); // must not throw
    expect(parsed._warnings).toContain('No token specimens found');
  });

  it('keeps comment-style warnings for css format', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'css' });
    expect(result.text.startsWith('/* warnings:')).toBe(true);
  });

  it('keeps comment-style warnings for scss format', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = tokens.handler(idx, { format: 'scss' });
    expect(result.text.startsWith('/* warnings:')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify the tailwind/w3c ones fail**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: FAIL — `JSON.parse` throws on the `/* warnings: ... */` prefix for tailwind and w3c.

- [ ] **Step 3: Implement the fix**

In `src/tools/get-tokens.ts`, replace lines 94-97:

```ts
  // For non-json formats, append warnings as a CSS/SCSS comment so they're discoverable.
  if (format !== 'json' && warnings.length > 0) {
    text = `/* warnings: ${warnings.join('; ')} */\n${text}`;
  }
```

with:

```ts
  // Surface warnings in a format-appropriate way: a comment for text formats,
  // an embedded _warnings key for JSON-document formats (tailwind, w3c).
  if (warnings.length > 0) {
    if (format === 'css' || format === 'scss') {
      text = `/* warnings: ${warnings.join('; ')} */\n${text}`;
    } else if (format === 'tailwind' || format === 'w3c') {
      text = JSON.stringify(
        { ...(JSON.parse(text) as Record<string, unknown>), _warnings: warnings },
        null,
        2,
      );
    }
    // format === 'json' already embeds _warnings in its payload.
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-tokens.ts src/tests/tools-visual.test.ts
git commit -m "fix(tools): emit valid JSON for tailwind/w3c get_tokens warnings"
```

---

### Task 3: Runtime context coercion for all context-taking tools

The MCP SDK does not enforce `inputSchema` enums at runtime. A client passing `context: "marketing"` makes `index[ctx]` undefined and the eight context-taking tools throw `TypeError` instead of degrading gracefully with `_warnings`.

**Files:**
- Create: `src/tools/_context.ts`
- Modify: `src/tools/get-colors-and-type.ts`, `src/tools/get-css.ts`, `src/tools/get-tokens.ts`, `src/tools/get-motion.ts`, `src/tools/get-assets.ts`, `src/tools/get-fonts.ts`, `src/tools/get-components.ts`, `src/tools/get-context-diff.ts`
- Test: `src/tests/tools-visual.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/tools-visual.test.ts`. The file already imports `cat` (get-colors-and-type), `tokens`, `css`, `motion`, `assets`, `fonts`, `components`; add an import for the diff tool at the top of the file:

```ts
import * as contextDiff from '../tools/get-context-diff.js';
```

Then append:

```ts
describe('runtime context coercion (tolerance principle)', () => {
  it('get_colors_and_type falls back to base with a warning for unknown context', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'marketing' as never });
    const parsed = JSON.parse(result.text);
    expect(parsed.context).toBe('base');
    expect(parsed._warnings.some((w: string) => w.includes('marketing'))).toBe(true);
  });

  it('all single-context visual tools tolerate an unknown context', () => {
    const idx = buildFixtureIndex('v2/full');
    for (const mod of [css, tokens, motion, assets, fonts, components]) {
      const [result] = mod.handler(idx, { context: 'shared' as never });
      const parsed = JSON.parse(result.text);
      expect(parsed.context).toBe('base');
      expect(parsed._warnings.some((w: string) => w.includes('shared'))).toBe(true);
    }
  });

  it('get_context_diff tolerates unknown contexts and surfaces warnings', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = contextDiff.handler(idx, { a: 'marketing' as never, b: 'product' });
    const parsed = JSON.parse(result.text);
    expect(parsed.a).toBe('base');
    expect(parsed.b).toBe('product');
    expect(parsed._warnings.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: FAIL — `TypeError: Cannot read properties of undefined`.

- [ ] **Step 3: Create the shared coercion helper**

Create `src/tools/_context.ts`:

```ts
/**
 * @file _context.ts
 * @description Runtime coercion for the `context` tool argument.
 * The MCP SDK does not enforce inputSchema enums at runtime, so tools must
 * tolerate out-of-enum values per the tolerance principle: fall back to
 * 'base' and record a warning instead of throwing.
 */

import type { BrandContext } from '../types/design-system.js';

const CONTEXTS = ['base', 'web', 'product'] as const;

export function coerceContext(value: unknown, warnings: string[]): BrandContext {
  if (value === undefined || value === null) return 'base';
  if (typeof value === 'string' && (CONTEXTS as readonly string[]).includes(value)) {
    return value as BrandContext;
  }
  warnings.push(`Unknown context "${String(value)}"; falling back to "base"`);
  return 'base';
}
```

- [ ] **Step 4: Apply the helper in the six simple tools**

In each of `get-colors-and-type.ts`, `get-css.ts`, `get-motion.ts`, `get-assets.ts`, `get-fonts.ts`, add the import and swap the first two handler lines. The pattern (shown for `get-colors-and-type.ts`; apply identically to the others):

```ts
import { coerceContext } from './_context.js';
```

and replace:

```ts
  const ctx = args.context ?? 'base';
  const warnings: string[] = [];
```

(or the same two lines in the other order — `get-motion.ts` declares `warnings` second) with:

```ts
  const warnings: string[] = [];
  const ctx = coerceContext(args.context, warnings);
```

- [ ] **Step 5: Apply the helper in get-tokens.ts and get-components.ts**

`src/tools/get-tokens.ts` — replace:

```ts
  const ctx = args.context ?? 'base';
  const format = args.format ?? 'json';
  const warnings: string[] = [];
```

with:

```ts
  const warnings: string[] = [];
  const ctx = coerceContext(args.context, warnings);
  const format = args.format ?? 'json';
```

(add the `import { coerceContext } from './_context.js';` import). Note Task 2's format-aware warning injection now also carries these coercion warnings — correct by construction.

`src/tools/get-components.ts` — same swap of the `ctx`/`warnings` lines, plus harden the name filter: replace

```ts
  if (args.name) {
```

with

```ts
  if (typeof args.name === 'string' && args.name.length > 0) {
```

(the body, using `args.name!.toLowerCase()`, can drop the `!` since the type is narrowed — change to `args.name.toLowerCase()`).

- [ ] **Step 6: Apply the helper in get-context-diff.ts**

In `src/tools/get-context-diff.ts`, replace:

```ts
  const a = args.a ?? 'web';
  const b = args.b ?? 'product';
```

with:

```ts
  const warnings: string[] = [];
  const a = args.a === undefined ? 'web' : coerceContext(args.a, warnings);
  const b = args.b === undefined ? 'product' : coerceContext(args.b, warnings);
```

add the import, and replace the hardcoded `_warnings: [],` (line 68) with `_warnings: warnings,`.

- [ ] **Step 7: Run all tests, typecheck, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS across the board.

- [ ] **Step 8: Commit**

```bash
git add src/tools/_context.ts src/tools/get-colors-and-type.ts src/tools/get-css.ts src/tools/get-tokens.ts src/tools/get-motion.ts src/tools/get-assets.ts src/tools/get-fonts.ts src/tools/get-components.ts src/tools/get-context-diff.ts src/tests/tools-visual.test.ts
git commit -m "fix(tools): coerce out-of-enum context args to base with a warning"
```

---

### Task 4: search_brand / validate_usage — guard missing required args

`search-brand.ts:35` calls `args.query.toLowerCase()` and `validate-usage.ts:41` calls `args.snippet.matchAll(...)`; both throw `TypeError` when a client omits the schema-required argument.

**Files:**
- Modify: `src/tools/search-brand.ts`, `src/tools/validate-usage.ts`
- Test: `src/tests/tools-visual.test.ts`

- [ ] **Step 1: Write the failing tests**

Add imports at the top of `src/tests/tools-visual.test.ts`:

```ts
import * as search from '../tools/search-brand.js';
import * as validateUsage from '../tools/validate-usage.js';
```

Append:

```ts
describe('required-arg guards', () => {
  it('search_brand degrades gracefully when query is missing', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = search.handler(idx, {} as never);
    const parsed = JSON.parse(result.text);
    expect(parsed.results).toEqual([]);
    expect(parsed._warnings.some((w: string) => w.includes('query'))).toBe(true);
  });

  it('validate_usage degrades gracefully when snippet is missing', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = validateUsage.handler(idx, {} as never);
    const parsed = JSON.parse(result.text);
    expect(parsed.violations).toEqual([]);
    expect(parsed._warnings.some((w: string) => w.includes('snippet'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: FAIL with `TypeError` on both new tests.

- [ ] **Step 3: Implement the guards**

`src/tools/search-brand.ts` — change the handler signature's args type to `{ query?: unknown; limit?: number }` and insert at the top of the handler body (before `const q = ...`):

```ts
  if (typeof args.query !== 'string' || args.query.length === 0) {
    return [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { query: null, results: [], _warnings: ['Missing or invalid required "query" argument'] },
          null,
          2,
        ),
      },
    ];
  }
  const q = args.query.toLowerCase();
```

(The remainder of the handler is unchanged; `args.query` is narrowed to `string` past the guard.)

`src/tools/validate-usage.ts` — change the args type to `{ snippet?: unknown; format?: 'html' | 'css' }` and insert at the top of the handler body:

```ts
  if (typeof args.snippet !== 'string') {
    return [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { violations: [], _warnings: ['Missing or invalid required "snippet" argument'] },
          null,
          2,
        ),
      },
    ];
  }
```

The two later uses (`args.snippet.matchAll(hexRe)` and `args.snippet.matchAll(dataRe)`) are unchanged — TypeScript narrows `args.snippet` to `string` after the guard.

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run src/tests/tools-visual.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/search-brand.ts src/tools/validate-usage.ts src/tests/tools-visual.test.ts
git commit -m "fix(tools): guard missing query/snippet args instead of throwing"
```

---

### Task 5: hot-reload — serialize reindexes and wire up the stop function

Two bugs: (a) the 300ms debounce guards scheduling but not execution, so a reindex triggered while another is in flight runs concurrently, and last-to-*complete* wins — a stale index can clobber a newer one; (b) `startServer` discards the stop function, so the chokidar watcher is never closed, and `watcher.close()`'s promise is unhandled.

**Files:**
- Modify: `src/indexer/hot-reload.ts`, `src/index.ts:64-70`
- Test: `src/tests/hot-reload.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/tests/hot-reload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createReindexRunner } from '../indexer/hot-reload.js';
import type { DesignSystemIndex } from '../indexer/types.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createReindexRunner', () => {
  it('never runs two reindexes concurrently and coalesces overlapping triggers', async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const gates = [deferred(), deferred(), deferred()];
    const updates: DesignSystemIndex[] = [];

    const reindex = async (): Promise<DesignSystemIndex> => {
      const myGate = gates[runs];
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      await myGate.promise;
      active--;
      return { brandName: `run-${runs}` } as never;
    };

    const run = createReindexRunner(reindex, (i) => updates.push(i));

    const p1 = run();
    const p2 = run(); // arrives while run 1 is in flight
    expect(runs).toBe(1); // not started concurrently

    gates[0].resolve();
    await p1;
    await p2;
    await new Promise((r) => setTimeout(r, 0)); // let the queued rerun start

    expect(runs).toBe(2); // coalesced rerun executed after the first completed
    gates[1].resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(maxActive).toBe(1);
    expect(updates).toHaveLength(2);
  });

  it('keeps running after a failed reindex', async () => {
    let runs = 0;
    const updates: DesignSystemIndex[] = [];
    const reindex = async (): Promise<DesignSystemIndex> => {
      runs++;
      if (runs === 1) throw new Error('scan exploded');
      return { brandName: 'ok' } as never;
    };
    const run = createReindexRunner(reindex, (i) => updates.push(i));
    await run(); // swallows the error (logged, not thrown)
    await run();
    expect(updates).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/hot-reload.test.ts`
Expected: FAIL — `createReindexRunner` is not exported.

- [ ] **Step 3: Implement createReindexRunner and rewire watchBrandDirectory**

Replace the body of `src/indexer/hot-reload.ts` from the `triggerReindex` declaration down (keep the imports, the doc comments, the `watchBrandDirectory` signature, and the `chokidar.watch(...)` block) with:

```ts
/**
 * Serializes reindex executions: at most one reindex runs at a time. A
 * trigger that arrives mid-flight queues exactly one follow-up run, so the
 * final state always reflects the latest filesystem events (no
 * last-to-complete-wins race). Errors are logged, never thrown.
 * Exported for tests.
 */
export function createReindexRunner(
  reindex: () => Promise<DesignSystemIndex>,
  onUpdate: (index: DesignSystemIndex) => void,
): () => Promise<void> {
  let inFlight = false;
  let rerunRequested = false;

  const run = async (): Promise<void> => {
    if (inFlight) {
      rerunRequested = true;
      return;
    }
    inFlight = true;
    try {
      onUpdate(await reindex());
    } catch (err) {
      console.error('[hot-reload] Re-indexing failed:', err);
    } finally {
      inFlight = false;
      if (rerunRequested) {
        rerunRequested = false;
        void run();
      }
    }
  };

  return run;
}
```

and inside `watchBrandDirectory`, after the `chokidar.watch(...)` block, replace the old `triggerReindex` + return with:

```ts
  const runReindex = createReindexRunner(async () => {
    console.error('[hot-reload] File change detected, re-indexing...');
    const startTime = Date.now();
    const newIndex = await buildDesignSystemIndex(config);
    console.error(`[hot-reload] Re-indexed in ${Date.now() - startTime}ms`);
    return newIndex;
  }, onUpdate);

  const triggerReindex = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void runReindex();
    }, DEBOUNCE_MS);
  };

  watcher.on('add', triggerReindex);
  watcher.on('change', triggerReindex);
  watcher.on('unlink', triggerReindex);

  return async () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    try {
      await watcher.close();
    } catch (err) {
      console.error('[hot-reload] Failed to close watcher:', err);
    }
  };
```

Update the `watchBrandDirectory` return type from `() => void` to `() => Promise<void>` and its doc comment line `@returns A function to stop the watcher` to `@returns An async function that stops the watcher and resolves when closed`.

- [ ] **Step 4: Capture the stop function in startServer**

In `src/index.ts`, replace lines 64-70:

```ts
  if (options.watch) {
    console.error('[brandkit-mcp] File watching enabled');
    watchBrandDirectory(config, (newIndex) => {
      currentIndex = newIndex;
      console.error(`[brandkit-mcp] Index updated: ${newIndex.base.tokens.length + newIndex.base.components.length + newIndex.base.assets.length} assets`);
    });
  }
```

with:

```ts
  if (options.watch) {
    console.error('[brandkit-mcp] File watching enabled');
    const stopWatcher = watchBrandDirectory(config, (newIndex) => {
      currentIndex = newIndex;
      console.error(`[brandkit-mcp] Index updated: ${newIndex.base.tokens.length + newIndex.base.components.length + newIndex.base.assets.length} assets`);
    });
    // Close the watcher on shutdown so the process can exit cleanly.
    const shutdown = (signal: NodeJS.Signals) => {
      void stopWatcher().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/indexer/hot-reload.ts src/index.ts src/tests/hot-reload.test.ts
git commit -m "fix(indexer): serialize hot-reload reindexes and close watcher on shutdown"
```

---

### Task 6: Single source of truth for the server version

`src/index.ts:58`, `src/adapters/standalone.ts:26`, `src/adapters/vercel.ts:39`, and `src/adapters/cloudflare-worker.ts:22` all advertise hardcoded `0.1.0` on a v2.0.2 package. The CLI already reads package.json (`readPackageVersion` in `src/cli/index.ts:19-36`) — extract that into a shared module.

**Files:**
- Create: `src/version.ts`
- Modify: `src/cli/index.ts`, `src/index.ts:58`, `src/adapters/standalone.ts:26`, `src/adapters/vercel.ts:39`, `src/adapters/cloudflare-worker.ts:22`, `RELEASING.md`
- Test: `src/tests/version.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/tests/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPackageVersion } from '../version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('getPackageVersion', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
    expect(getPackageVersion()).toBe(pkg.version);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/version.test.ts`
Expected: FAIL — module `../version.js` does not exist.

- [ ] **Step 3: Create src/version.ts**

```ts
/**
 * @file version.ts
 * @description Single source of truth for the package version at runtime.
 * Walks up from the compiled module location looking for package.json so it
 * works from src/ (vitest), dist/ (tsup output), and bundled CLI layouts.
 *
 * NOTE: src/adapters/cloudflare-worker.ts cannot use this module (Workers
 * have no fs); it carries a hardcoded version updated at release time.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function getPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, '../package.json'),
      join(here, '../../package.json'),
      join(here, '../../../package.json'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        try {
          return JSON.parse(readFileSync(c, 'utf-8')).version as string;
        } catch {
          // unreadable/corrupt candidate; try the next one
        }
      }
    }
  } catch {
    // import.meta.url unavailable in unusual runtimes
  }
  return '0.0.0';
}
```

- [ ] **Step 4: Use it everywhere**

1. `src/cli/index.ts`: delete the local `readPackageVersion` function (lines 19-36) and its now-unused `readFileSync`/`existsSync`/`dirname`/`join`/`fileURLToPath` imports (keep any still used elsewhere in the file — after deletion none of those five are used). Add `import { getPackageVersion } from '../version.js';` and change `.version(readPackageVersion())` to `.version(getPackageVersion())`.
2. `src/index.ts:58`: change `{ name: 'brandkit-mcp', version: '0.1.0' }` to `{ name: 'brandkit-mcp', version: getPackageVersion() }` and add `import { getPackageVersion } from './version.js';`.
3. `src/adapters/standalone.ts:26`: same change, import from `'../version.js'`.
4. `src/adapters/vercel.ts:39`: same change, import from `'../version.js'`.
5. `src/adapters/cloudflare-worker.ts:22`: change `version: '0.1.0',` to `version: '2.0.2', // keep in sync with package.json — see RELEASING.md`.
6. `RELEASING.md`: add this line to the version-bump checklist/steps section (read the file first and place it alongside the existing package.json/server.json bump steps):

```markdown
- Update the hardcoded version in `src/adapters/cloudflare-worker.ts` (Workers cannot read package.json at runtime).
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS (including the existing `cli.test.ts` version tests).

- [ ] **Step 6: Commit**

```bash
git add src/version.ts src/cli/index.ts src/index.ts src/adapters/standalone.ts src/adapters/vercel.ts src/adapters/cloudflare-worker.ts RELEASING.md src/tests/version.test.ts
git commit -m "fix(server): advertise real package version instead of hardcoded 0.1.0"
```

---

### Task 7: Standalone adapter — per-session transports, config-dir resolution, exact entry guard

Three bugs in `src/adapters/standalone.ts`: a single module-scoped `sseTransport` is clobbered by each new client (misrouting POSTs); config paths resolve against `process.cwd()` instead of the config file's directory (the bug already fixed in `src/index.ts`); and the auto-start guard fires for any argv path *containing* "standalone".

**Files:**
- Modify: `src/adapters/standalone.ts` (full rewrite of the function body)
- Test: `src/tests/standalone-adapter.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/tests/standalone-adapter.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import { startStandaloneServer } from '../adapters/standalone.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(__dirname, '../..', '__test_fixtures__', 'v2', 'full');

function writeTempConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-standalone-'));
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: Test Brand\n  root: ${JSON.stringify(fixtureRoot)}\n`,
  );
  return configPath;
}

describe('startStandaloneServer', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('serves /health and returns 400 (not a hang) for /messages without a session', async () => {
    server = await startStandaloneServer(0, writeTempConfig());
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('no address');
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);

    const messages = await fetch(`${base}/messages?sessionId=nope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(messages.status).toBe(400);
    const body = await messages.json();
    expect(body.error).toContain('No active SSE session');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/standalone-adapter.test.ts`
Expected: FAIL — `startStandaloneServer` returns `Promise<void>` (type error / `server.address` undefined). The old code also resolves config against cwd.

- [ ] **Step 3: Rewrite the adapter**

Replace the full contents of `src/adapters/standalone.ts` with:

```ts
/**
 * @file adapters/standalone.ts
 * @description Standalone HTTP server adapter for BrandKit MCP.
 * Runs the MCP server with SSE transport on a plain Node.js HTTP server
 * without any framework dependencies beyond the MCP SDK.
 * Transports are tracked per sessionId so multiple clients can connect
 * concurrently (mirrors the express SSE path in src/index.ts).
 */

import { createServer, type Server as HttpServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { loadConfigWithPath, resolveConfigPaths } from '../config/loader.js';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { registerAllTools } from '../tools/index.js';
import { getPackageVersion } from '../version.js';

/**
 * Starts a standalone HTTP server with SSE transport.
 * @param port - Port to listen on (default: 3001; pass 0 for an ephemeral port)
 * @param configPath - Optional path to brandkit.config.yaml
 * @returns The listening http.Server (caller may close() it)
 */
export async function startStandaloneServer(
  port: number = 3001,
  configPath?: string,
): Promise<HttpServer> {
  const { config: rawConfig, filePath } = loadConfigWithPath(configPath);
  const config = resolveConfigPaths(rawConfig, dirname(filePath));
  const index = await buildDesignSystemIndex(config);

  const mcpServer = new Server(
    { name: 'brandkit-mcp', version: getPackageVersion() },
    { capabilities: { tools: {} } },
  );
  registerAllTools(mcpServer, () => index);

  // One transport per connected client, keyed by sessionId.
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', assets: index.base.tokens.length + index.base.components.length + index.base.assets.length }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sse') {
      const transport = new SSEServerTransport('/messages', res as never);
      sessions.set(transport.sessionId, transport);
      res.on('close', () => sessions.delete(transport.sessionId));
      await mcpServer.connect(transport);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId') ?? '';
      const transport = sessions.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req as never, res as never);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active SSE session for sessionId' }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise<void>((resolveListen) => {
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      console.error(`[brandkit-mcp] Standalone server running at http://localhost:${actualPort}`);
      console.error(`[brandkit-mcp] SSE endpoint: http://localhost:${actualPort}/sse`);
      console.error(`[brandkit-mcp] Health check: http://localhost:${actualPort}/health`);
      resolveListen();
    });
  });

  return httpServer;
}

// Auto-start only when this file is the direct entry point.
const isDirectRun = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  const port = parseInt(process.env.PORT ?? '3001', 10);
  startStandaloneServer(port).catch(console.error);
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/standalone.ts src/tests/standalone-adapter.test.ts
git commit -m "fix(adapters): per-session SSE transports + config-dir paths in standalone server"
```

---

### Task 8: Vercel adapter — session map, no silent hang, documented limitation

`handleMessages` silently returns nothing when `sseTransport` is null (the client hangs), and the single module-level transport is clobbered per connection. SSE fundamentally requires a warm instance on serverless; document that honestly.

**Files:**
- Modify: `src/adapters/vercel.ts`
- Test: `src/tests/vercel-adapter.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/tests/vercel-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { handleMessages } from '../adapters/vercel.js';

describe('vercel adapter handleMessages', () => {
  it('responds 400 instead of hanging when no SSE session exists', async () => {
    let status: number | undefined;
    let body: string | undefined;
    const req = { url: '/api/messages?sessionId=missing', method: 'POST' };
    const res = {
      writeHead: (s: number) => {
        status = s;
      },
      end: (b: string) => {
        body = b;
      },
    };
    await handleMessages(req, res);
    expect(status).toBe(400);
    expect(JSON.parse(body ?? '{}').error).toContain('No active SSE session');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/vercel-adapter.test.ts`
Expected: FAIL — old `handleMessages` returns without writing any response, so `status` stays undefined.

- [ ] **Step 3: Rewrite the adapter**

Replace the full contents of `src/adapters/vercel.ts` with:

```ts
/**
 * @file vercel.ts
 * @description Vercel serverless function adapter for BrandKit MCP.
 *
 * LIMITATION: SSE requires the GET /api/sse stream and subsequent
 * POST /api/messages calls to land on the same warm instance. With Fluid
 * Compute (instance reuse) this generally holds for a single client; under
 * cold starts or multi-instance fan-out the session will not be found and
 * the POST returns 400 (the client should reconnect). For robust serverless
 * deployment prefer the Streamable HTTP transport in src/index.ts.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { loadConfigWithPath, resolveConfigPaths } from '../config/loader.js';
import { dirname } from 'path';
import { buildDesignSystemIndex } from '../indexer/index.js';
import { registerAllTools } from '../tools/index.js';
import { getPackageVersion } from '../version.js';
import type { DesignSystemIndex } from '../indexer/types.js';

let cachedIndex: DesignSystemIndex | null = null;
// One transport per connected client, keyed by sessionId (warm instance only).
const sessions = new Map<string, InstanceType<typeof SSEServerTransport>>();

async function getIndex(): Promise<DesignSystemIndex> {
  if (!cachedIndex) {
    const { config: rawConfig, filePath } = loadConfigWithPath();
    const config = resolveConfigPaths(rawConfig, dirname(filePath));
    cachedIndex = await buildDesignSystemIndex(config);
  }
  return cachedIndex;
}

/**
 * SSE endpoint handler for Vercel.
 * GET /api/sse -- establishes an SSE connection.
 */
export async function handleSSE(req: { method?: string }, res: {
  writeHead: (status: number, headers: Record<string, string>) => void;
  write: (data: string) => void;
  end: () => void;
  on: (event: string, handler: () => void) => void;
  status?: (code: number) => { json: (body: unknown) => void };
}): Promise<void> {
  const index = await getIndex();

  const server = new Server(
    { name: 'brandkit-mcp', version: getPackageVersion() },
    { capabilities: { tools: {} } },
  );

  registerAllTools(server, () => index);

  const transport = new SSEServerTransport('/api/messages', res as never);
  sessions.set(transport.sessionId, transport);
  res.on('close', () => sessions.delete(transport.sessionId));
  await server.connect(transport);
}

/**
 * Message handler for Vercel.
 * POST /api/messages?sessionId=... -- handles incoming MCP messages.
 */
export async function handleMessages(req: unknown, res: unknown): Promise<void> {
  const rawUrl = (req as { url?: string }).url ?? '';
  const sessionId = new URL(rawUrl, 'http://localhost').searchParams.get('sessionId') ?? '';
  const transport = sessions.get(sessionId);
  if (!transport) {
    const r = res as {
      writeHead: (status: number, headers?: Record<string, string>) => void;
      end: (body: string) => void;
    };
    r.writeHead(400, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify({ error: 'No active SSE session for sessionId (instance may have recycled; reconnect to /api/sse)' }));
    return;
  }
  await transport.handlePostMessage(req as never, res as never);
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/vercel.ts src/tests/vercel-adapter.test.ts
git commit -m "fix(adapters): vercel session map + 400 on missing session instead of hanging"
```

---

### Task 9: docs/validate commands — resolve brand root against the config file's directory

Both commands use `resolveConfigPaths(rawConfig, process.cwd())`. `src/index.ts:42-48` was deliberately fixed to resolve against `dirname(filePath)`; these were missed, so `brandkit-mcp docs --config ../elsewhere/brandkit.config.yaml` scans a nonexistent path and silently reports empty inventories.

**Files:**
- Modify: `src/cli/commands/docs.ts:62-64`, `src/cli/commands/validate.ts:18-27`
- Test: `src/tests/docs-command.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/tests/docs-command.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { docsCommand } from '../cli/commands/docs.js';

describe('docs command path resolution', () => {
  const originalCwd = process.cwd();
  let configDir: string;
  let outDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'bk-docs-cfg-'));
    outDir = mkdtempSync(join(tmpdir(), 'bk-docs-out-'));
    // Minimal brand tree NEXT TO the config file, referenced relatively.
    mkdirSync(join(configDir, 'bas', 'agent', 'visual', 'tokens'), { recursive: true });
    writeFileSync(
      join(configDir, 'bas', 'agent', 'visual', 'tokens', 'color-primary.md'),
      '---\nname: color-primary\nvalue: "#112233"\ntype: color\n---\nPrimary.\n',
    );
    writeFileSync(
      join(configDir, 'brandkit.config.yaml'),
      'version: 2\nbrand:\n  name: PathTest\n  root: ./bas\n',
    );
    // Run from an UNRELATED cwd — the bug resolved ./bas against this.
    process.chdir(tmpdir());
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('resolves brand.root against the config directory, not cwd', async () => {
    await docsCommand({ config: join(configDir, 'brandkit.config.yaml'), output: outDir });
    const claude = readFileSync(join(outDir, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('| Tokens | 1 |');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/docs-command.test.ts`
Expected: FAIL — inventory shows `| Tokens | 0 |` because `./bas` resolved against the wrong directory.

- [ ] **Step 3: Fix docs.ts**

In `src/cli/commands/docs.ts`:
- Change the loader import (line 14) from `import { loadConfig, resolveConfigPaths } from '../../config/loader.js';` to `import { loadConfigWithPath, resolveConfigPaths } from '../../config/loader.js';`
- Change the `path` import (line 13) from `import { join } from 'path';` to `import { join, dirname } from 'path';`
- Replace lines 62-63:

```ts
  const rawConfig = loadConfig(options.config);
  const config = resolveConfigPaths(rawConfig, process.cwd());
```

with:

```ts
  // Resolve relative paths against the config file's own directory (same
  // portability fix as startServer in src/index.ts).
  const { config: rawConfig, filePath } = loadConfigWithPath(options.config);
  const config = resolveConfigPaths(rawConfig, dirname(filePath));
```

- [ ] **Step 4: Fix validate.ts the same way**

In `src/cli/commands/validate.ts`:
- Change line 8 to `import { loadConfigWithPath, resolveConfigPaths } from '../../config/loader.js';`
- Add `import { dirname } from 'path';` and `import type { BrandKitConfig } from '../../types/config.js';`
- Replace lines 18-22:

```ts
  let config;
  try {
    const rawConfig = loadConfig(configPath);
    config = resolveConfigPaths(rawConfig, process.cwd());
```

with:

```ts
  let config: BrandKitConfig;
  try {
    const { config: rawConfig, filePath } = loadConfigWithPath(configPath);
    config = resolveConfigPaths(rawConfig, dirname(filePath));
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS (note `cli.test.ts` exercises these commands — confirm it still passes).

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/docs.ts src/cli/commands/validate.ts src/tests/docs-command.test.ts
git commit -m "fix(cli): resolve brand root against config dir in docs and validate"
```

---

### Task 10: Token specimens — accept falsy values, stringify numeric values

`parseTokenSpecimen` (`src/parsers/markdown-parser.ts:251-259`) rejects `value: 0` / `value: false` via truthiness, and casts YAML numbers to `string` without converting, so `TokenSpecimen.value` lies about its type for numeric tokens.

**Files:**
- Modify: `src/parsers/markdown-parser.ts:251-259`
- Test: `src/tests/token-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/token-parser.test.ts` (check the top of the file for its existing tempfile pattern and reuse it; if it has none, add this helper after the imports):

```ts
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function specimenFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-token-'));
  const path = join(dir, 'token.md');
  writeFileSync(path, content);
  return path;
}
```

Then:

```ts
describe('parseTokenSpecimen value edge cases', () => {
  it('accepts a falsy-but-present value (value: 0)', () => {
    const path = specimenFile('---\nname: spacing-0\nvalue: 0\ntype: spacing\n---\nZero spacing.\n');
    const { specimen, warnings } = parseTokenSpecimen(path);
    expect(warnings).toEqual([]);
    expect(specimen?.name).toBe('spacing-0');
    expect(specimen?.value).toBe('0');
  });

  it('stringifies numeric values', () => {
    const path = specimenFile('---\nname: z-modal\nvalue: 1000\ntype: z-index\n---\n');
    const { specimen } = parseTokenSpecimen(path);
    expect(specimen?.value).toBe('1000');
    expect(typeof specimen?.value).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/token-parser.test.ts`
Expected: FAIL — `value: 0` is skipped as "missing required frontmatter"; `value: 1000` comes back as a number.

- [ ] **Step 3: Implement the fix**

In `src/parsers/markdown-parser.ts`, replace lines 251-259:

```ts
  const name = data.name as string | undefined;
  const value = data.value as string | undefined;
  const type = data.type as string | undefined;
  if (!name || !value || !type) {
    warnings.push(
      `Token specimen at ${filePath} missing required frontmatter (name/value/type); skipping`,
    );
    return { specimen: null, warnings };
  }
```

with:

```ts
  const name = data.name as string | undefined;
  const type = data.type as string | undefined;
  // value may legitimately be falsy (0, false) — check presence, not truthiness.
  const hasValue = data.value !== undefined && data.value !== null;
  if (!name || !hasValue || !type) {
    warnings.push(
      `Token specimen at ${filePath} missing required frontmatter (name/value/type); skipping`,
    );
    return { specimen: null, warnings };
  }
  // YAML parses bare numbers/booleans to non-strings; TokenSpecimen.value is a string.
  const value = String(data.value);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/token-parser.test.ts src/tests/parsers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/markdown-parser.ts src/tests/token-parser.test.ts
git commit -m "fix(parsers): accept falsy token values and stringify numeric frontmatter"
```

---

### Task 11: extractSection — stop truncating multi-line sections

The regex at `src/parsers/markdown-parser.ts:190-195` combines the `m` flag with `$` as a lazy-capture terminator, so `$` matches the first line end and component "Usage" sections are silently cut to one line.

**Files:**
- Modify: `src/parsers/markdown-parser.ts:192`
- Test: `src/tests/parsers.test.ts`

- [ ] **Step 1: Write the failing test**

`extractSection` is module-private; test through its public consumer `parseComponentMarkdown` (already exercised in `src/tests/parsers.test.ts` — match that file's tempfile conventions). Append:

```ts
describe('component usage section extraction', () => {
  it('captures multi-line Usage sections, not just the first line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-component-'));
    const path = join(dir, 'button.md');
    writeFileSync(
      path,
      '---\nname: Button\n---\n# Button\n\n## Usage\nLine one.\nLine two.\n\n## Other\nIgnored.\n',
    );
    const [component] = parseComponentMarkdown(path, 'base');
    expect(component.usage).toContain('Line one.');
    expect(component.usage).toContain('Line two.');
    expect(component.usage).not.toContain('Ignored');
  });
});
```

(If `parsers.test.ts` does not already import `parseComponentMarkdown`, `mkdtempSync`, `writeFileSync`, `tmpdir`, or `join`, add those imports to match the pattern used in `verbal-parser.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/parsers.test.ts`
Expected: FAIL — `usage` is `"Line one."` only.

- [ ] **Step 3: Implement the fix**

In `src/parsers/markdown-parser.ts:192`, replace:

```ts
  const re = new RegExp(`^##\\s+${escaped}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$)`, 'mi');
```

with:

```ts
  // Terminate at the next `## ` heading or true end-of-string. A bare `$`
  // with the m flag matches every line end and truncates the capture.
  const re = new RegExp(`^##\\s+${escaped}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$(?![\\s\\S]))`, 'mi');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/parsers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/markdown-parser.ts src/tests/parsers.test.ts
git commit -m "fix(parsers): extract full multi-line markdown sections"
```

---

### Task 12: Config loader — missing `version: 2` throws BrandkitV1ConfigError

CLAUDE.md promises "A `brandkit.config.yaml` without `version: 2` throws `BrandkitV1ConfigError`", but the loader only throws it on positive v1 markers; a config merely missing `version` gets a generic Zod error without migration guidance.

**Files:**
- Modify: `src/config/loader.ts:138-145`
- Test: `src/tests/config-v2.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('config loader v1 rejection', ...)` block in `src/tests/config-v2.test.ts`:

```ts
  it('throws BrandkitV1ConfigError when version is missing entirely', () => {
    const yaml = `brand:\n  name: Acme\n`;
    expect(() => loadConfigFromString(yaml, '/tmp/fake.yaml')).toThrow(BrandkitV1ConfigError);
  });

  it('throws BrandkitV1ConfigError on a non-2 version', () => {
    const yaml = `version: 3\nbrand:\n  name: Acme\n`;
    expect(() => loadConfigFromString(yaml, '/tmp/fake.yaml')).toThrow(BrandkitV1ConfigError);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/config-v2.test.ts`
Expected: FAIL — both throw generic `Error('Invalid config ...')`, not `BrandkitV1ConfigError`.

- [ ] **Step 3: Implement the fix**

In `src/config/loader.ts`, directly after the existing `isV1Config` block (after line 144's closing `}`), insert:

```ts
  // CLAUDE.md contract: a config without `version: 2` throws
  // BrandkitV1ConfigError with migration guidance, even when no positive
  // v1 marker is present.
  if (parsedObj.version !== 2) {
    throw new BrandkitV1ConfigError(
      `Config at ${sourcePath} is missing \`version: 2\` (found: ${JSON.stringify(parsedObj.version)}). ` +
        'BrandKit v2 requires `version: 2`. ' +
        'Migrate to v2: see docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md',
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/config-v2.test.ts && npx vitest run`
Expected: PASS — including the pre-existing v1-rejection tests (they throw before reaching the new check) and the Zod-schema test (which tests the schema directly, not the loader).

- [ ] **Step 5: Commit**

```bash
git add src/config/loader.ts src/tests/config-v2.test.ts
git commit -m "fix(config): throw BrandkitV1ConfigError for any config without version: 2"
```

---

### Task 13: Document `config.contexts` as reserved (no-op)

The schema validates `contexts` but nothing reads it — `resolveAll` always materializes all three contexts. Document the field as reserved rather than removing it (init-generated configs include it) or honoring it (would change the index shape).

**Files:**
- Modify: `src/types/config.ts:22-24`, `CLAUDE.md` (Conventions section)

- [ ] **Step 1: Annotate the schema field**

In `src/types/config.ts`, replace lines 22-24:

```ts
  contexts: z
    .array(z.enum(['base', 'web', 'product']))
    .default(['base', 'web', 'product']),
```

with:

```ts
  // RESERVED: accepted for forward compatibility but not yet honored — the
  // resolver always materializes all three contexts. See CLAUDE.md.
  contexts: z
    .array(z.enum(['base', 'web', 'product']))
    .default(['base', 'web', 'product']),
```

- [ ] **Step 2: Add the convention to CLAUDE.md**

In `CLAUDE.md`, in the `## Conventions` section, after the "**Context vocabulary.**" paragraph, add:

```markdown
**`config.contexts` is reserved.** The field is validated and defaulted but
not yet honored: the resolver always materializes `base`, `web`, and
`product`. Setting `contexts: [base]` does not disable the override layers.
```

- [ ] **Step 3: Run tests and commit**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (comment/doc-only change).

```bash
git add src/types/config.ts CLAUDE.md
git commit -m "docs(config): mark contexts field as reserved no-op"
```

---

### Task 14: extractTypography — classify specific token names before generic substrings

The `else if` chain at `src/context-resolver.ts:177-189` tests broad substrings (`size`, `weight`, `line`) before specific ones, so e.g. `--text-underline-offset` lands in `lineHeight`. Reorder specific-first and tighten the bare `line` check to segment boundaries.

**Files:**
- Modify: `src/context-resolver.ts:177-189`
- Test: `src/tests/resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Look at the top of `src/tests/resolver.test.ts` for how it builds inputs (it tests `resolveAll`/merge logic against scan data). Add a test that goes through the public path. `extractTypography` consumes `colorsAndType.customProperties` during `materialize`, so build a minimal `ScanResult`-shaped input the way the existing tests in that file do, with these custom properties, and assert on `resolved.base.typography`:

```ts
describe('extractTypography classification', () => {
  it('does not misfile tokens containing generic substrings', () => {
    const scan = {
      magicTrick: undefined,
      verbal: {},
      base: {
        colorsAndType: {
          filePath: '/fake/colors_and_type.css',
          rawContent: '',
          customProperties: {
            '--text-underline-offset': '2px',
            '--line-height-tight': '1.2',
            '--letter-spacing-wide': '0.05em',
            '--font-size-display': '4rem',
          },
        },
        components: [],
        tokens: [],
        assets: [],
        fonts: [],
        motion: undefined,
      },
      web: { colorsAndType: undefined, components: [], tokens: [], assets: [], fonts: [], motion: undefined },
      product: { colorsAndType: undefined, components: [], tokens: [], assets: [], fonts: [], motion: undefined },
      warnings: [],
    };
    const resolved = resolveAll(scan as never, { brandName: 'T' });
    const byToken = Object.fromEntries(resolved.base.typography.map((t) => [t.token, t]));

    // --text-underline-offset must NOT be classified as lineHeight
    expect(byToken['--text-underline-offset']?.lineHeight).toBeUndefined();
    expect(byToken['--line-height-tight']?.lineHeight).toBe('1.2');
    expect(byToken['--letter-spacing-wide']?.letterSpacing).toBe('0.05em');
    expect(byToken['--font-size-display']?.fontSize).toBe('4rem');
  });
});
```

NOTE for the implementer: adjust the literal shape above to whatever `ScanResult`/`RawContextData` actually requires if TypeScript complains — the `as never` cast plus the existing test file's construction pattern is the guide. If `--text-underline-offset` does not pass the `TYPO_TOKEN_RE` gate at `context-resolver.ts:168` (check the regex near the top of the file), substitute a token that both passes the gate and contains a misleading `line` substring (e.g. `--type-baseline-shift`), keeping the assertion that it is not classified as `lineHeight`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/resolver.test.ts`
Expected: FAIL — the misleading token gets `lineHeight: '2px'`.

- [ ] **Step 3: Implement the fix**

In `src/context-resolver.ts`, replace lines 177-189:

```ts
    if (lower.includes('font-family') || lower.includes('font-display') || lower.includes('font-body')) {
      item.fontFamily = trimmed;
    } else if (lower.includes('font-size') || lower.includes('size')) {
      item.fontSize = trimmed;
    } else if (lower.includes('font-weight') || lower.includes('weight')) {
      item.fontWeight = trimmed;
    } else if (lower.includes('line-height') || lower.includes('line')) {
      item.lineHeight = trimmed;
    } else if (lower.includes('letter-spacing') || lower.includes('tracking')) {
      item.letterSpacing = trimmed;
    } else if (lower.includes('text-transform')) {
      item.textTransform = trimmed;
    }
```

with (specific patterns first, generic fallbacks last, bare `line` bounded to a name segment):

```ts
    if (lower.includes('font-family') || lower.includes('font-display') || lower.includes('font-body')) {
      item.fontFamily = trimmed;
    } else if (lower.includes('letter-spacing') || lower.includes('tracking')) {
      item.letterSpacing = trimmed;
    } else if (lower.includes('line-height')) {
      item.lineHeight = trimmed;
    } else if (lower.includes('text-transform')) {
      item.textTransform = trimmed;
    } else if (lower.includes('font-size') || lower.includes('size')) {
      item.fontSize = trimmed;
    } else if (lower.includes('font-weight') || lower.includes('weight')) {
      item.fontWeight = trimmed;
    } else if (/(^|-)line(-|$)/.test(lower)) {
      item.lineHeight = trimmed;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/resolver.test.ts && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context-resolver.ts src/tests/resolver.test.ts
git commit -m "fix(resolver): classify typography tokens specific-first"
```

---

### Task 15: Consolidate token formatters (remove buggy dead modules)

`src/formatters/{css,scss,tailwind,w3c-tokens,json-tokens}.ts` are imported nowhere (verified by grep) and two contain real bugs (shallow-merge clobbering in w3c, order-dependent DEFAULT collisions in tailwind). The live formatting lives inline in `get-tokens.ts`. Consolidate: move the live implementations into `src/formatters/token-formatters.ts`, delete the dead modules, import from `get-tokens.ts`. CLAUDE.md's structure entry (`formatters/ # token output formatters`) stays true.

**Files:**
- Create: `src/formatters/token-formatters.ts`
- Delete: `src/formatters/css.ts`, `src/formatters/scss.ts`, `src/formatters/tailwind.ts`, `src/formatters/w3c-tokens.ts`, `src/formatters/json-tokens.ts`
- Modify: `src/tools/get-tokens.ts` (remove inline `toCSS`/`toSCSS`/`toTailwind`/`toW3C`, add import)
- Test: `src/tests/formatters.test.ts` (create)

- [ ] **Step 1: Write the test (drives the new module's API)**

Create `src/tests/formatters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCSS, toSCSS, toTailwind, toW3C } from '../formatters/token-formatters.js';
import type { TokenSpecimen } from '../types/design-system.js';

const tokens: TokenSpecimen[] = [
  { name: 'color-primary', value: '#112233', type: 'color', body: '', source: '/t/a.md' },
  { name: 'spacing-0', value: '0', type: 'spacing', role: 'baseline', body: '', source: '/t/b.md' },
];

describe('token formatters', () => {
  it('toCSS emits a :root block with custom properties', () => {
    const css = toCSS(tokens);
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #112233;');
  });

  it('toSCSS emits $variables', () => {
    expect(toSCSS(tokens)).toContain('$spacing-0: 0;');
  });

  it('toTailwind emits valid JSON grouped by type', () => {
    const parsed = JSON.parse(toTailwind(tokens));
    expect(parsed.theme.extend.color['color-primary']).toBe('#112233');
  });

  it('toW3C emits valid JSON with $value/$type', () => {
    const parsed = JSON.parse(toW3C(tokens));
    expect(parsed['color-primary']).toEqual({ $value: '#112233', $type: 'color', $description: undefined });
    expect(parsed['spacing-0'].$description).toBe('baseline');
  });
});
```

(If `TokenSpecimen` requires fields beyond `name/value/type/role/body/source`, check `src/types/design-system.ts` and fill them in.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/formatters.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module and rewire get-tokens.ts**

Create `src/formatters/token-formatters.ts` by moving the four functions verbatim from `src/tools/get-tokens.ts:29-53`, exported:

```ts
/**
 * @file token-formatters.ts
 * @description Output formatters for token specimens (css, scss, tailwind, w3c).
 * Consumed by the get_tokens tool.
 */

import type { TokenSpecimen } from '../types/design-system.js';

export function toCSS(tokens: TokenSpecimen[]): string {
  const lines = tokens.map((t) => `  --${t.name}: ${t.value};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function toSCSS(tokens: TokenSpecimen[]): string {
  return tokens.map((t) => `$${t.name}: ${t.value};`).join('\n') + '\n';
}

export function toTailwind(tokens: TokenSpecimen[]): string {
  const byType: Record<string, Record<string, string>> = {};
  for (const t of tokens) {
    byType[t.type] ??= {};
    byType[t.type][t.name] = t.value;
  }
  return JSON.stringify({ theme: { extend: byType } }, null, 2);
}

export function toW3C(tokens: TokenSpecimen[]): string {
  const out: Record<string, { $value: string; $type: string; $description?: string }> = {};
  for (const t of tokens) {
    out[t.name] = { $value: t.value, $type: t.type, $description: t.role };
  }
  return JSON.stringify(out, null, 2);
}
```

In `src/tools/get-tokens.ts`: delete the four inline functions (lines 29-53) and add:

```ts
import { toCSS, toSCSS, toTailwind, toW3C } from '../formatters/token-formatters.js';
```

Then delete the dead modules:

```bash
git rm src/formatters/css.ts src/formatters/scss.ts src/formatters/tailwind.ts src/formatters/w3c-tokens.ts src/formatters/json-tokens.ts
```

- [ ] **Step 4: Run tests, typecheck, lint, build**

Run: `npx vitest run && npm run typecheck && npm run lint && npm run build`
Expected: PASS (build confirms no dangling imports of the deleted modules).

- [ ] **Step 5: Commit**

```bash
git add src/formatters/token-formatters.ts src/tools/get-tokens.ts src/tests/formatters.test.ts
git commit -m "refactor(formatters): consolidate live token formatters, drop buggy dead modules"
```

---

### Task 16: init — scaffold the `human/` directory

The documented v2 layout includes `human/`, and the generated config writes `ignore: ['human/']`, but the starter template has no `human/` directory, so `init` never creates one.

**Files:**
- Modify: `src/cli/commands/init.ts` (after the `copyRecursive` call, line 63)
- Test: `src/tests/init-human.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/tests/init-human.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initCommand } from '../cli/commands/init.js';

describe('init scaffolds human/', () => {
  it('creates the human/ drop zone with a readme', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-init-'));
    await initCommand(dir, { name: 'Scaffold Test' });
    const readmePath = join(dir, 'brand_atomic_system', 'human', 'readme.md');
    expect(existsSync(readmePath)).toBe(true);
    expect(readFileSync(readmePath, 'utf-8')).toContain('ignores this directory');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/init-human.test.ts`
Expected: FAIL — `human/readme.md` does not exist.

- [ ] **Step 3: Implement the fix**

In `src/cli/commands/init.ts`, after `copyRecursive(templatesDir, brandDir);` (line 63), insert:

```ts
  // The starter template ships only agent-readable content; create the
  // human/ drop zone (PDFs, print specs) that the v2 layout documents.
  mkdirSync(join(brandDir, 'human'), { recursive: true });
  writeFileSync(
    join(brandDir, 'human', 'readme.md'),
    '# human/\n\nDrop PDFs, print specs, and other human-only material here.\nThe MCP scanner ignores this directory entirely.\n',
  );
```

(`mkdirSync`, `writeFileSync`, and `join` are already imported.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/init-human.test.ts src/tests/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/init.ts src/tests/init-human.test.ts
git commit -m "fix(init): scaffold the documented human/ directory"
```

---

### Task 17: Scanner — actually suppress the spurious motion.json warning

The comment at `src/scanner/directory-scanner.ts:215-217` promises to suppress "No motion.json" warnings when a `motion.css` exists (CSS-only motion systems are valid), but the code pushes all warnings unconditionally.

**Files:**
- Modify: `src/scanner/directory-scanner.ts:213-217`
- Test: `src/tests/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/tests/scanner.test.ts` (match its existing tempdir/fixture conventions — it already exercises `scanBrandRoot`):

```ts
describe('css-only motion systems', () => {
  it('does not warn about missing motion.json when motion.css exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-motion-'));
    const motionDir = join(root, 'agent', 'visual', 'motion');
    mkdirSync(motionDir, { recursive: true });
    writeFileSync(join(motionDir, 'motion.css'), '.fade { transition: opacity 200ms; }\n');
    const scan = scanBrandRoot(root);
    expect(scan.warnings.find((w) => w.includes('No motion.json'))).toBeUndefined();
    expect(scan.base.motion?.css).toContain('.fade');
  });
});
```

(Add `mkdirSync`/`mkdtempSync`/`writeFileSync`/`tmpdir`/`join` imports if the file lacks them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/scanner.test.ts`
Expected: FAIL — a `No motion.json found in ...` warning is present.

- [ ] **Step 3: Implement the fix**

In `src/scanner/directory-scanner.ts`, replace lines 214-217:

```ts
      const result = parseMotionDir(motionDir);
      // Only add warnings that don't mention missing motion.json when there's
      // at least a motion.css (partial motion systems are valid)
      warnings.push(...result.warnings);
```

with:

```ts
      const result = parseMotionDir(motionDir);
      // A CSS-only motion system is valid: suppress the "No motion.json"
      // warning when motion.css is present.
      const filtered = result.css
        ? result.warnings.filter((w) => !w.startsWith('No motion.json found'))
        : result.warnings;
      warnings.push(...filtered);
```

(The warning string is produced at `src/parsers/motion-parser.ts:35` as `` `No motion.json found in ${dir}` `` — the `startsWith` match is exact.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/scanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanner/directory-scanner.ts src/tests/scanner.test.ts
git commit -m "fix(scanner): suppress motion.json warning for css-only motion systems"
```

---

### Task 18: css-parser — correct hex normalization

`normalizeToHex` (`src/parsers/css-parser.ts:170-180`) accepts 3-8 digit hex but only expands 3-digit shorthand: 4-digit #RGBA shorthand passes through unexpanded, and invalid 5/7-digit values are returned as fake hex.

**Files:**
- Modify: `src/parsers/css-parser.ts:170-180`
- Test: `src/tests/parsers.test.ts`

- [ ] **Step 1: Write the failing test**

`normalizeToHex` is private; it surfaces through `parseCSSFile`'s color extraction. Check `src/tests/parsers.test.ts` for the existing CSS-parser test pattern and how the normalized hex is exposed (the `DesignCSSFile`/color shape). If the normalized hex is not observable through any public output, make `normalizeToHex` exported (`export function normalizeToHex`) and test it directly:

```ts
import { normalizeToHex } from '../parsers/css-parser.js';

describe('normalizeToHex', () => {
  it('expands 3-digit shorthand', () => {
    expect(normalizeToHex('#abc')).toBe('#aabbcc');
  });
  it('expands 4-digit #RGBA shorthand', () => {
    expect(normalizeToHex('#abcd')).toBe('#aabbccdd');
  });
  it('rejects invalid 5- and 7-digit values', () => {
    expect(normalizeToHex('#abcde')).toBeUndefined();
    expect(normalizeToHex('#abcdeff')).toBeUndefined();
  });
  it('passes 6- and 8-digit values through', () => {
    expect(normalizeToHex('#aabbcc')).toBe('#aabbcc');
    expect(normalizeToHex('#aabbccdd')).toBe('#aabbccdd');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/parsers.test.ts`
Expected: FAIL on the 4-digit and 5/7-digit cases.

- [ ] **Step 3: Implement the fix**

Replace the function:

```ts
export function normalizeToHex(value: string): string | undefined {
  // Valid hex lengths: 3 (#rgb), 4 (#rgba), 6 (#rrggbb), 8 (#rrggbbaa).
  const hexMatch = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      return `#${[...hex].map((c) => c + c).join('')}`;
    }
    return `#${hex}`;
  }
  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/parsers.test.ts && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/css-parser.ts src/tests/parsers.test.ts
git commit -m "fix(parsers): expand 4-digit hex shorthand, reject 5/7-digit values"
```

---

### Task 19: Preview server — guard EJS rendering (latent hardening)

`renderPage` (`src/preview/server.ts:82-104`) wraps `readFileSync` in try/catch but not `ejs.render`; the surviving v1 templates reference variables that are never passed, so any render throws an uncaught exception → unhandled 500. The preview command is disabled, but `createPreviewServer` is still exported. Full v2 template rewrite stays out of scope.

**Files:**
- Modify: `src/preview/server.ts:94,103`

- [ ] **Step 1: Implement the guard**

In `renderPage`, replace:

```ts
    const body = ejs.render(templateContent, { ...data, config, index });
```

with:

```ts
    let body: string;
    try {
      body = ejs.render(templateContent, { ...data, config, index });
    } catch (err) {
      // Tolerance principle: a broken template renders an error page, not a 500.
      body = `<h1>Template error</h1><pre>${String(err)}</pre>`;
    }
```

and replace the final:

```ts
    return ejs.render(layoutContent, { body, title: data.title ?? config.brand.name, config });
```

with:

```ts
    try {
      return ejs.render(layoutContent, { body, title: data.title ?? config.brand.name, config });
    } catch {
      return body;
    }
```

- [ ] **Step 2: Run tests, typecheck, lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS (no preview tests exist; this is defensive hardening of disabled-but-exported code).

- [ ] **Step 3: Commit**

```bash
git add src/preview/server.ts
git commit -m "fix(preview): guard ejs rendering against template errors"
```

---

### Task 20: Final verification sweep

- [ ] **Step 1: Full suite**

Run: `npx vitest run && npm run typecheck && npm run lint && npm run build`
Expected: all PASS; test count strictly greater than the pre-plan 112.

- [ ] **Step 2: Grep for regressions of the fixed classes**

```bash
# No remaining hardcoded server versions:
grep -rn "version: '0.1.0'" src/ && echo "FAIL: stale version found" || echo "OK"
# No remaining cwd-based config resolution outside tests:
grep -rn "resolveConfigPaths(.*process.cwd()" src/ --include="*.ts" | grep -v tests && echo "FAIL" || echo "OK"
```

Expected: both `OK`.

- [ ] **Step 3: Smoke-run the stdio server against the bundled example**

Run: `node dist/cli/index.js validate examples/acme-corp/brandkit.config.yaml` (adjust the path if `ls examples/` shows a different layout; if no example exists, run against `templates/starter` instead, e.g. `node dist/cli/index.js validate templates/starter/brandkit.config.yaml`).
Expected: exit 0, non-empty inventory, no `[ERROR]` lines.

- [ ] **Step 4: Commit any stragglers and report**

```bash
git status --short
```

Expected: clean tree (apart from pre-existing untracked `.claude/`, `.mcp.json`, `.repowise/`, and the modified `.gitignore`, which are NOT part of this plan — leave them alone).

---

## Out of scope / deferred (decided, not forgotten)

| Item | Disposition |
|---|---|
| `colorsAndType` per-property merge | Working as specced (whole-file shadowing). No change. |
| Preview v2 EJS template rewrite (`motion`/`fonts`/`verbal` templates missing; v1 vars in `colors`/`typography`/`components`) | Separate project; command is disabled with a clear message. Task 19 only prevents crashes. |
| `getPrompt` throwing on unknown prompt names | SDK converts handler exceptions to JSON-RPC errors; protocol-correct. |
| Resolved-context object aliasing in `context-resolver.ts` | Read-only consumers today; revisit if write tools land. |
| `walkDir`'s effectively-dead `ignore` prefix logic in `directory-scanner.ts` | Informational; no behavior change wanted. |
| `generateBase64DataURI` unguarded SVG read (`image-parser.ts:83`) | No callers exist; fix when the function gains a consumer. |
