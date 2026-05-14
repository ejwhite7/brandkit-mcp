# Brand Atomic System Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure BrandKit MCP from `brand/{shared,marketing,product}` into a `brand_atomic_system/{human,agent/{verbal,visual}}` layout, deliver an 18-tool MCP surface aligned with the new categories, and inject `magic_trick.md` as a taste primer into creative/verbal tool responses. Breaking 2.0.0 release.

**Architecture:** TDD, bottom-up. Phase 1 reshapes types/config/parsers/scanner/resolver against new fixtures and the rewritten example brand. Phase 2 builds the 18-tool surface on top of the new foundation (taste primer included). Phase 3 rewrites docs and ships 2.0.0.

**Tech Stack:** TypeScript, Node 20+, vitest, zod, gray-matter, js-yaml, css-tree, @modelcontextprotocol/sdk, tsup, esm modules.

**Companion spec:** `docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md`

**Tolerance principle (cross-cutting):** Parsers degrade gracefully. Every tool response carries a `_warnings: string[]` field. Missing frontmatter, unfamiliar YAML shapes, and absent manifests never throw — log a warning and continue.

---

## File map

### Created

```
docs/superpowers/plans/2026-05-14-brand-atomic-system-restructure.md  (this file)
src/parsers/yaml-parser.ts
src/parsers/motion-parser.ts
src/parsers/verbal-parser.ts
src/tools/_taste-primer.ts
src/tools/get-colors-and-type.ts
src/tools/get-assets.ts
src/tools/get-fonts.ts
src/tools/get-motion.ts
src/tools/get-magic-trick.ts
src/tools/get-positioning.ts
src/tools/get-audience.ts
src/tools/get-messaging.ts
src/tools/get-differentiation.ts
src/tools/get-concepts.ts
src/tools/get-voice.ts
src/tests/yaml-parser.test.ts
src/tests/motion-parser.test.ts
src/tests/verbal-parser.test.ts
src/tests/taste-primer.test.ts
src/tests/scanner.test.ts
src/tests/resolver.test.ts
src/tests/tools-verbal.test.ts
src/tests/tools-visual.test.ts
src/tests/tools-overview.test.ts
src/tests/config-v2.test.ts
examples/acme-corp/brand_atomic_system/...   (whole new tree per spec)
templates/starter/brand_atomic_system/...    (whole new tree per spec)
__test_fixtures__/v2/...                     (fixtures for new file types)
```

### Modified

```
src/types/design-system.ts         (replace BrandContext; add new types)
src/types/config.ts                (v2 zod schema)
src/types/mcp.ts                   (new arg types)
src/config/defaults.ts             (v2 defaults)
src/config/loader.ts               (v1 rejection)
src/scanner/directory-scanner.ts   (rewrite)
src/context-resolver.ts            (rewrite)
src/indexer/types.ts               (new shapes)
src/indexer/index.ts               (wire new scanner + resolver)
src/parsers/markdown-parser.ts     (parse new file kinds)
src/parsers/css-parser.ts          (colors_and_type conventions)
src/tools/get-brand-overview.ts    (new tool list + taste primer)
src/tools/get-components.ts        (new path)
src/tools/get-tokens.ts            (specimens dir)
src/tools/get-css.ts               (structured return)
src/tools/search-brand.ts          (reindex)
src/tools/validate-usage.ts        (new targets)
src/tools/get-context-diff.ts      (base|web|product)
src/tools/index.ts                 (new registrations)
src/resources/index.ts             (new URIs)
src/prompts/index.ts               (vocabulary)
src/index.ts                       (server metadata)
README.md
CLAUDE.md
RELEASING.md
package.json                       (version 2.0.0)
examples/acme-corp/brandkit.config.yaml
templates/starter/brandkit.config.yaml
```

### Deleted

```
src/tools/get-colors.ts
src/tools/get-typography.ts
src/tools/get-textures.ts
src/tools/get-logos.ts
src/tools/get-guidelines.ts
examples/acme-corp/brand/                        (whole v1 tree)
templates/starter/brand/                         (whole v1 tree)
__test_fixtures__/{button.md,test-colors.css,brand-voice.md,palette.md}  (v1 fixtures)
```

---

## Recipe: Verbal-prose markdown tool

Five tools — `get_positioning`, `get_messaging`, `get_differentiation`, `get_concepts`, `get_voice` — are structurally identical: read one markdown file at a known path, return its content with a taste primer attached. This recipe captures the template once. Each individual task references it.

```ts
// src/tools/get-<name>.ts
import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_<name>';

export const TOOL_DESCRIPTION =
  '<one-liner describing the verbal section>';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function handler(index: DesignSystemIndex) {
  const doc = index.verbal.<key>; // { frontmatter, body, source } or undefined
  const warnings: string[] = [];

  if (!doc) {
    warnings.push('No <name> document found at agent/verbal/<name>.md');
  }

  const payload = attachTastePrimer(
    {
      content: doc?.body ?? '',
      frontmatter: doc?.frontmatter ?? {},
      source: doc?.source,
      _warnings: warnings,
    },
    index,
  );

  return [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }];
}
```

And the test template:

```ts
// src/tests/tools-verbal.test.ts (one describe block per tool)
import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as positioning from '../tools/get-positioning.js';

describe('get_positioning', () => {
  it('returns the parsed positioning doc with a taste primer', () => {
    const index = buildFixtureIndex('v2/full');
    const [result] = positioning.handler(index);
    const parsed = JSON.parse(result.text);

    expect(parsed.content).toContain('We help solo founders');
    expect(parsed._taste_primer).toContain('Specificity beats abstraction');
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when the file is missing', () => {
    const index = buildFixtureIndex('v2/empty');
    const [result] = positioning.handler(index);
    const parsed = JSON.parse(result.text);

    expect(parsed.content).toBe('');
    expect(parsed._warnings).toEqual([
      'No positioning document found at agent/verbal/positioning.md',
    ]);
  });
});
```

The recipe assumes:
- `index.verbal` is `Record<'positioning'|'audience'|'messaging'|'differentiation'|'concepts'|'voice', VerbalDoc | undefined>` (defined in Task 5).
- `buildFixtureIndex(name)` is a test helper added in Task 14 that returns a fully built `DesignSystemIndex` from a fixture brand root.
- `attachTastePrimer(payload, index)` is the shared helper from Task 22.

---

# Phase 1 — Foundation

Goal: types, config, parsers, scanner, and resolver all understand the v2 layout, with fixtures and the rewritten example to exercise them.

---

### Task 1: Types — replace `DesignContext` and add v2 interfaces

**Files:**
- Modify: `src/types/design-system.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/types-v2.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  BrandContext,
  VerbalDoc,
  AudienceDoc,
  MotionSystem,
  AssetEntry,
  FontFace,
  TokenSpecimen,
  MagicTrick,
} from '../types/design-system.js';

describe('v2 types', () => {
  it('BrandContext is base|web|product', () => {
    expectTypeOf<BrandContext>().toEqualTypeOf<'base' | 'web' | 'product'>();
  });
  it('VerbalDoc has frontmatter and body', () => {
    expectTypeOf<VerbalDoc>().toMatchTypeOf<{
      frontmatter: Record<string, unknown>;
      body: string;
      source: string;
    }>();
  });
  it('AudienceDoc is freeform', () => {
    expectTypeOf<AudienceDoc>().toMatchTypeOf<{
      data: unknown;
      source: string;
    }>();
  });
  it('MotionSystem carries json + css text', () => {
    expectTypeOf<MotionSystem>().toMatchTypeOf<{
      tokens: unknown;
      css: string;
      source: string;
    }>();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/types-v2.test.ts`
Expected: FAIL — types don't exist.

- [ ] **Step 3: Update `src/types/design-system.ts`**

Replace the `DesignContext` block with:

```ts
/**
 * v2 design contexts.
 * - "base"    : default layer under agent/visual/ outside artifacts/
 * - "web"     : override layer under agent/visual/artifacts/web/
 * - "product" : override layer under agent/visual/artifacts/product/
 */
export type BrandContext = 'base' | 'web' | 'product';

/** @deprecated Use BrandContext. Retained only to ease migration; remove before release. */
export type DesignContext = BrandContext;
```

Append at the end of the file:

```ts
// ---------------------------------------------------------------------------
// v2 — Verbal documents
// ---------------------------------------------------------------------------

/** A markdown document under agent/verbal/. */
export interface VerbalDoc {
  frontmatter: Record<string, unknown>;
  body: string;
  source: string;
}

/** Freeform audience document parsed from audience.yaml. */
export interface AudienceDoc {
  data: unknown;
  source: string;
}

/** The human-authored taste primer. */
export interface MagicTrick {
  content: string;
  source: string;
}

// ---------------------------------------------------------------------------
// v2 — Motion system
// ---------------------------------------------------------------------------

/** Combined motion.json (parsed) + motion.css (raw text). */
export interface MotionSystem {
  tokens: unknown;
  css: string;
  source: string;
}

// ---------------------------------------------------------------------------
// v2 — Assets and fonts
// ---------------------------------------------------------------------------

export interface AssetEntry {
  id?: string;
  file: string;
  purpose?: string;
  format: string;
  filePath: string;
}

export interface FontFace {
  family: string;
  weight?: string | number;
  style?: 'normal' | 'italic';
  file: string;
  filePath: string;
  format: 'otf' | 'ttf' | 'woff' | 'woff2';
}

// ---------------------------------------------------------------------------
// v2 — Token specimens
// ---------------------------------------------------------------------------

export interface TokenSpecimen {
  name: string;
  value: string;
  type: string;
  role?: string;
  related?: string[];
  body: string;
  source: string;
}
```

Also update every `DesignContext` usage in `ResolvedDesignSystem` and elsewhere to `BrandContext` (rg for `DesignContext` to find them — the deprecated alias above will keep them compiling).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/types-v2.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/design-system.ts src/tests/types-v2.test.ts
git commit -m "feat(types): add v2 BrandContext + verbal/visual/motion shapes"
```

---

### Task 2: Config v2 schema

**Files:**
- Modify: `src/types/config.ts`
- Create: `src/tests/config-v2.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/config-v2.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BrandKitConfigSchema, BrandkitV1ConfigError } from '../types/config.js';

describe('config v2', () => {
  it('accepts a minimal v2 config', () => {
    const parsed = BrandKitConfigSchema.parse({
      version: 2,
      brand: { name: 'Acme Corp' },
    });
    expect(parsed.contexts).toEqual(['base', 'web', 'product']);
    expect(parsed.brand.root).toBe('./brand_atomic_system');
    expect(parsed.ignore).toContain('human/');
  });

  it('rejects v1 configs with a typed error', () => {
    expect(() =>
      BrandKitConfigSchema.parse({
        name: 'Old Brand',
        version: '1.0.0',
        contexts: { marketing: {}, product: {} },
      }),
    ).toThrow(/version/);
  });

  it('BrandkitV1ConfigError is a real error class', () => {
    const e = new BrandkitV1ConfigError('test');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('BrandkitV1ConfigError');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/config-v2.test.ts`
Expected: FAIL.

- [ ] **Step 3: Replace `src/types/config.ts`**

```ts
import { z } from 'zod';

export class BrandkitV1ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandkitV1ConfigError';
  }
}

export const BrandKitConfigSchema = z.object({
  version: z.literal(2, {
    errorMap: () => ({
      message:
        'BrandKit v2 requires `version: 2`. See docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md for migration.',
    }),
  }),
  brand: z.object({
    name: z.string().min(1, 'brand.name is required'),
    description: z.string().optional(),
    root: z.string().default('./brand_atomic_system'),
  }),
  contexts: z
    .array(z.enum(['base', 'web', 'product']))
    .default(['base', 'web', 'product']),
  ignore: z.array(z.string()).default(['human/']),
  preview: z
    .object({
      port: z.number().int().min(1).max(65535).default(3000),
      host: z.string().default('localhost'),
    })
    .default({}),
  server: z
    .object({
      transport: z.enum(['stdio', 'sse']).default('stdio'),
      port: z.number().int().min(1).max(65535).default(3001),
      host: z.string().default('localhost'),
    })
    .default({}),
});

export type BrandKitConfig = z.infer<typeof BrandKitConfigSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/config-v2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/config.ts src/tests/config-v2.test.ts
git commit -m "feat(config): zod v2 schema with BrandkitV1ConfigError"
```

---

### Task 3: Config loader — v1 rejection

**Files:**
- Modify: `src/config/loader.ts`
- Modify: `src/config/defaults.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/tests/config-v2.test.ts`:

```ts
import { loadConfigFromString } from '../config/loader.js';

describe('config loader', () => {
  it('rejects v1 yaml with BrandkitV1ConfigError', () => {
    const yaml = `
name: Old Brand
version: 1.0.0
paths:
  brand: ./brand
`;
    expect(() => loadConfigFromString(yaml, '/tmp/fake.yaml')).toThrow(
      BrandkitV1ConfigError,
    );
  });

  it('loads a minimal v2 yaml', () => {
    const yaml = `
version: 2
brand:
  name: Acme
`;
    const cfg = loadConfigFromString(yaml, '/tmp/fake.yaml');
    expect(cfg.brand.name).toBe('Acme');
    expect(cfg.contexts).toEqual(['base', 'web', 'product']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/config-v2.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Update `src/config/loader.ts`**

Add a `loadConfigFromString(yamlText, sourcePath): BrandKitConfig` helper that:

1. Runs `js-yaml`'s `load`.
2. Detects v1 by the presence of any of: top-level `name` (instead of `brand.name`), top-level `paths`, `contexts.marketing`, `contexts.product` as objects.
3. If v1 detected, throws `new BrandkitV1ConfigError(\`v1 config detected at \${sourcePath}. Migrate to v2: see <link>\`)`.
4. Otherwise `BrandKitConfigSchema.parse(...)` the parsed YAML and return.

Wire the existing `loadConfig(path)` to read the file and call `loadConfigFromString`.

- [ ] **Step 4: Update `src/config/defaults.ts`**

Export a `DEFAULT_CONFIG: BrandKitConfig` that matches the v2 schema defaults (the zod `.default()`s already handle this; defaults.ts just re-exports a parsed empty input):

```ts
import { BrandKitConfigSchema, type BrandKitConfig } from '../types/config.js';

export const DEFAULT_CONFIG: BrandKitConfig = BrandKitConfigSchema.parse({
  version: 2,
  brand: { name: 'BrandKit' },
});
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/tests/config-v2.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/config/loader.ts src/config/defaults.ts src/tests/config-v2.test.ts
git commit -m "feat(config): v1 rejection with BrandkitV1ConfigError"
```

---

### Task 4: YAML parser

**Files:**
- Create: `src/parsers/yaml-parser.ts`
- Create: `src/tests/yaml-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/yaml-parser.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseYamlFile } from '../parsers/yaml-parser.js';

function fixture(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-yaml-'));
  const path = join(dir, 'fixture.yaml');
  writeFileSync(path, content);
  return path;
}

describe('parseYamlFile', () => {
  it('parses well-formed YAML', () => {
    const path = fixture(`personas:\n  - id: founder\n    name: Solo founder\n`);
    const { data, warnings } = parseYamlFile(path);
    expect(data).toEqual({ personas: [{ id: 'founder', name: 'Solo founder' }] });
    expect(warnings).toEqual([]);
  });

  it('returns warning + empty data on malformed YAML', () => {
    const path = fixture(`personas:\n  - id: founder\n    name: : :\n  bad`);
    const { data, warnings } = parseYamlFile(path);
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/yaml/i);
  });

  it('returns warning on missing file (does not throw)', () => {
    const { data, warnings } = parseYamlFile('/nonexistent/path.yaml');
    expect(data).toBeNull();
    expect(warnings[0]).toMatch(/not.*read|not.*found/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/yaml-parser.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/parsers/yaml-parser.ts`**

```ts
import { readFileSync } from 'fs';
import { load } from 'js-yaml';

export interface YamlParseResult {
  data: unknown;
  warnings: string[];
  source: string;
}

export function parseYamlFile(path: string): YamlParseResult {
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    return {
      data: null,
      warnings: [`Could not read YAML file: ${path} (${(err as Error).message})`],
      source: path,
    };
  }

  try {
    const data = load(text);
    return { data: data ?? null, warnings: [], source: path };
  } catch (err) {
    return {
      data: null,
      warnings: [`Invalid YAML in ${path}: ${(err as Error).message}`],
      source: path,
    };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/yaml-parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/yaml-parser.ts src/tests/yaml-parser.test.ts
git commit -m "feat(parsers): tolerant yaml-parser"
```

---

### Task 5: Motion parser

**Files:**
- Create: `src/parsers/motion-parser.ts`
- Create: `src/tests/motion-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/motion-parser.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseMotionDir } from '../parsers/motion-parser.js';

function motionFixture(json: string | null, css: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-motion-'));
  if (json !== null) writeFileSync(join(dir, 'motion.json'), json);
  if (css !== null) writeFileSync(join(dir, 'motion.css'), css);
  return dir;
}

describe('parseMotionDir', () => {
  it('parses both motion.json and motion.css', () => {
    const dir = motionFixture(
      JSON.stringify({ durations: { fast: '120ms' } }),
      ':root { --motion-fast: 120ms }',
    );
    const result = parseMotionDir(dir);
    expect(result.tokens).toEqual({ durations: { fast: '120ms' } });
    expect(result.css).toContain('--motion-fast');
    expect(result.warnings).toEqual([]);
  });

  it('returns warning if motion.json missing', () => {
    const dir = motionFixture(null, ':root {}');
    const result = parseMotionDir(dir);
    expect(result.tokens).toBeNull();
    expect(result.warnings.some((w) => /motion\.json/.test(w))).toBe(true);
  });

  it('returns warning if motion.json malformed (does not throw)', () => {
    const dir = motionFixture('{not json', ':root {}');
    const result = parseMotionDir(dir);
    expect(result.tokens).toBeNull();
    expect(result.warnings.some((w) => /motion\.json/.test(w))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/motion-parser.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/parsers/motion-parser.ts`**

```ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface MotionParseResult {
  tokens: unknown;
  css: string;
  warnings: string[];
  source: string;
}

export function parseMotionDir(dir: string): MotionParseResult {
  const warnings: string[] = [];
  const jsonPath = join(dir, 'motion.json');
  const cssPath = join(dir, 'motion.css');

  let tokens: unknown = null;
  if (existsSync(jsonPath)) {
    try {
      tokens = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    } catch (err) {
      warnings.push(`Invalid motion.json: ${(err as Error).message}`);
    }
  } else {
    warnings.push(`No motion.json found in ${dir}`);
  }

  let css = '';
  if (existsSync(cssPath)) {
    try {
      css = readFileSync(cssPath, 'utf-8');
    } catch (err) {
      warnings.push(`Could not read motion.css: ${(err as Error).message}`);
    }
  }

  return { tokens, css, warnings, source: dir };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/motion-parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/motion-parser.ts src/tests/motion-parser.test.ts
git commit -m "feat(parsers): motion-parser for motion.json + motion.css"
```

---

### Task 6: Verbal-doc parser

**Files:**
- Create: `src/parsers/verbal-parser.ts`
- Create: `src/tests/verbal-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/verbal-parser.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseVerbalDoc } from '../parsers/verbal-parser.js';

function md(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-verbal-'));
  const path = join(dir, 'positioning.md');
  writeFileSync(path, content);
  return path;
}

describe('parseVerbalDoc', () => {
  it('parses markdown with frontmatter', () => {
    const path = md('---\nowner: ej\n---\n# Positioning\n\nWe help solo founders.\n');
    const doc = parseVerbalDoc(path);
    expect(doc?.frontmatter.owner).toBe('ej');
    expect(doc?.body).toContain('We help solo founders');
  });

  it('parses markdown without frontmatter', () => {
    const path = md('# Positioning\n\nWe help solo founders.\n');
    const doc = parseVerbalDoc(path);
    expect(doc?.frontmatter).toEqual({});
    expect(doc?.body).toContain('We help solo founders');
  });

  it('returns undefined on missing file', () => {
    expect(parseVerbalDoc('/nonexistent/file.md')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/verbal-parser.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/parsers/verbal-parser.ts`**

```ts
import matter from 'gray-matter';
import { readFileSync, existsSync } from 'fs';
import type { VerbalDoc } from '../types/design-system.js';

export function parseVerbalDoc(path: string): VerbalDoc | undefined {
  if (!existsSync(path)) return undefined;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
  const { data, content } = matter(raw);
  return {
    frontmatter: data as Record<string, unknown>,
    body: content.trim(),
    source: path,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/verbal-parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/verbal-parser.ts src/tests/verbal-parser.test.ts
git commit -m "feat(parsers): verbal-parser for agent/verbal/ markdown docs"
```

---

### Task 7: Build v2 fixture brand

**Files:**
- Create: `__test_fixtures__/v2/full/...` (a complete v2 tree)
- Create: `__test_fixtures__/v2/empty/...` (minimal, no agent/ content)

- [ ] **Step 1: Lay out the `full` fixture tree**

Create these files. The contents are intentionally short but realistic.

```
__test_fixtures__/v2/full/magic_trick.md
__test_fixtures__/v2/full/brandkit.config.yaml
__test_fixtures__/v2/full/agent/verbal/positioning.md
__test_fixtures__/v2/full/agent/verbal/audience.yaml
__test_fixtures__/v2/full/agent/verbal/messaging.md
__test_fixtures__/v2/full/agent/verbal/differentiation.md
__test_fixtures__/v2/full/agent/verbal/concepts.md
__test_fixtures__/v2/full/agent/verbal/voice.md
__test_fixtures__/v2/full/agent/visual/colors_and_type.css
__test_fixtures__/v2/full/agent/visual/components/button.md
__test_fixtures__/v2/full/agent/visual/tokens/color-primary.md
__test_fixtures__/v2/full/agent/visual/motion/motion.json
__test_fixtures__/v2/full/agent/visual/motion/motion.css
__test_fixtures__/v2/full/agent/visual/fonts/fonts.yaml
__test_fixtures__/v2/full/agent/visual/assets/assets.yaml
__test_fixtures__/v2/full/agent/visual/assets/logo-primary.svg
__test_fixtures__/v2/full/agent/visual/artifacts/web/colors_and_type.css
__test_fixtures__/v2/full/agent/visual/artifacts/product/components/button.md
```

Minimum content for each (verbatim):

```yaml
# brandkit.config.yaml
version: 2
brand:
  name: Acme Corp
  root: ./
```

```markdown
<!-- magic_trick.md -->
# Magic Trick

Specificity beats abstraction. Always one concrete moment over three abstract ones.
```

```markdown
<!-- agent/verbal/positioning.md -->
# Positioning

We help solo founders ship marketing pages without hiring a designer.
```

```yaml
# agent/verbal/audience.yaml
personas:
  - id: founder-marketer
    name: Solo founder doing marketing
    pain_points:
      - Reinventing layouts for every page
```

```markdown
<!-- agent/verbal/messaging.md -->
# Messaging

Ship on-brand fast.
```

```markdown
<!-- agent/verbal/differentiation.md -->
# Differentiation

We give LLMs the brand directly, not a PDF.
```

```markdown
<!-- agent/verbal/concepts.md -->
# Concepts

Atomic system. Taste primer. Magic trick.
```

```markdown
<!-- agent/verbal/voice.md -->
# Voice

Plainspoken. Concrete. No jargon.
```

```css
/* agent/visual/colors_and_type.css */
:root {
  --color-primary: #1a1a2e;
  --color-bg: #ffffff;
  --font-display: "Söhne", system-ui, sans-serif;
  --font-body: "Inter", sans-serif;
}
```

```markdown
<!-- agent/visual/components/button.md -->
---
name: button
category: primitive
status: stable
---
# Button

A primitive action element.
```

```markdown
<!-- agent/visual/tokens/color-primary.md -->
---
name: color-primary
value: "#1a1a2e"
type: color
role: Primary brand colour
related: [color-primary-hover]
---
# color-primary

Use on the most important interactive elements.
```

```json
// agent/visual/motion/motion.json
{
  "durations": { "fast": "120ms", "normal": "240ms" },
  "easings":   { "standard": "cubic-bezier(0.2, 0, 0, 1)" },
  "animations": { "fade-in": { "duration": "fast", "easing": "standard" } }
}
```

```css
/* agent/visual/motion/motion.css */
@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
:root { --motion-duration-fast: 120ms; }
```

```yaml
# agent/visual/fonts/fonts.yaml
faces:
  - family: Söhne
    weight: 400
    style: normal
    file: SohneBuch.otf
```

```yaml
# agent/visual/assets/assets.yaml
assets:
  - id: logo-primary
    file: logo-primary.svg
    purpose: Default logo
```

```svg
<!-- agent/visual/assets/logo-primary.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#1a1a2e"/></svg>
```

```css
/* agent/visual/artifacts/web/colors_and_type.css */
:root {
  --color-bg: #fafafa;
}
```

```markdown
<!-- agent/visual/artifacts/product/components/button.md -->
---
name: button
category: primitive
status: stable
---
# Button (product override)

Square corners on product.
```

- [ ] **Step 2: Lay out the `empty` fixture tree**

```
__test_fixtures__/v2/empty/brandkit.config.yaml
__test_fixtures__/v2/empty/agent/verbal/.gitkeep
__test_fixtures__/v2/empty/agent/visual/.gitkeep
```

`brandkit.config.yaml` mirrors the `full` one.

- [ ] **Step 3: Delete v1 fixtures**

```bash
git rm __test_fixtures__/button.md __test_fixtures__/test-colors.css __test_fixtures__/brand-voice.md __test_fixtures__/palette.md
```

- [ ] **Step 4: Commit**

```bash
git add __test_fixtures__/v2/
git commit -m "test: add v2 brand atomic system fixtures; drop v1 fixtures"
```

---

### Task 8: Update indexer types for v2

**Files:**
- Modify: `src/indexer/types.ts`

- [ ] **Step 1: Read the current shape**

Run: `cat src/indexer/types.ts`

Expect a `DesignSystemIndex` carrying `shared`, `marketing`, `product`, and `resolved` views. This task replaces that vocabulary.

- [ ] **Step 2: Write the failing typecheck**

Add to `src/tests/types-v2.test.ts`:

```ts
import type { DesignSystemIndex } from '../indexer/types.js';
import type { VerbalDoc, AudienceDoc, MagicTrick, MotionSystem } from '../types/design-system.js';

describe('DesignSystemIndex v2 shape', () => {
  it('has verbal docs keyed by category', () => {
    expectTypeOf<DesignSystemIndex['verbal']>().toMatchTypeOf<{
      positioning: VerbalDoc | undefined;
      audience: AudienceDoc | undefined;
      messaging: VerbalDoc | undefined;
      differentiation: VerbalDoc | undefined;
      concepts: VerbalDoc | undefined;
      voice: VerbalDoc | undefined;
    }>();
  });
  it('has magicTrick and motion', () => {
    expectTypeOf<DesignSystemIndex['magicTrick']>().toMatchTypeOf<MagicTrick | undefined>();
    expectTypeOf<DesignSystemIndex['motion']>().toMatchTypeOf<MotionSystem | undefined>();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/tests/types-v2.test.ts`
Expected: FAIL.

- [ ] **Step 4: Rewrite `src/indexer/types.ts`**

Replace the file with:

```ts
import type {
  BrandContext,
  ResolvedDesignSystem,
  VerbalDoc,
  AudienceDoc,
  MagicTrick,
  MotionSystem,
  TokenSpecimen,
  AssetEntry,
  FontFace,
  DesignComponent,
  DesignCSSFile,
} from '../types/design-system.js';

export interface RawContextData {
  colorsAndType?: DesignCSSFile;
  components: DesignComponent[];
  tokens: TokenSpecimen[];
  assets: AssetEntry[];
  fonts: FontFace[];
  motion?: MotionSystem;
}

export interface VerbalLayer {
  positioning: VerbalDoc | undefined;
  audience: AudienceDoc | undefined;
  messaging: VerbalDoc | undefined;
  differentiation: VerbalDoc | undefined;
  concepts: VerbalDoc | undefined;
  voice: VerbalDoc | undefined;
}

export interface DesignSystemIndex {
  brandName: string;
  brandDescription?: string;
  brandRoot: string;
  lastIndexed: Date;
  magicTrick: MagicTrick | undefined;
  verbal: VerbalLayer;
  base: RawContextData;
  web: RawContextData;
  product: RawContextData;
  resolved: Record<BrandContext, ResolvedDesignSystem>;
  warnings: string[];
}
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: many compile errors in existing tools/resolver — they reference the old `index.shared`, `index.marketing`, etc. We'll fix them in subsequent tasks. For now, only the new test should pass:

Run: `npx vitest run src/tests/types-v2.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit (with known broken tsc)**

```bash
git add src/indexer/types.ts src/tests/types-v2.test.ts
git commit -m "feat(indexer): v2 DesignSystemIndex shape (rest of repo compiles green after Tasks 9-11)"
```

---

### Task 9: Directory scanner rewrite

**Files:**
- Modify: `src/scanner/directory-scanner.ts`
- Create: `src/tests/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/scanner.test.ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { scanBrandRoot } from '../scanner/directory-scanner.js';

const FIXTURE = resolve(__dirname, '../../__test_fixtures__/v2/full');

describe('scanBrandRoot', () => {
  it('finds magic_trick.md', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.magicTrick?.content).toContain('Specificity beats abstraction');
  });

  it('parses all six verbal docs', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.verbal.positioning?.body).toContain('solo founders');
    expect(scan.verbal.messaging?.body).toContain('Ship on-brand');
    expect(scan.verbal.differentiation?.body).toContain('LLMs the brand');
    expect(scan.verbal.concepts?.body).toContain('Atomic system');
    expect(scan.verbal.voice?.body).toContain('Plainspoken');
    expect((scan.verbal.audience?.data as { personas: unknown[] }).personas).toHaveLength(1);
  });

  it('finds base visual content', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.base.colorsAndType?.customProperties['--color-primary']).toBe('#1a1a2e');
    expect(scan.base.components).toHaveLength(1);
    expect(scan.base.tokens).toHaveLength(1);
    expect(scan.base.motion?.tokens).toBeTruthy();
    expect(scan.base.fonts).toHaveLength(1);
    expect(scan.base.assets.length).toBeGreaterThanOrEqual(1);
  });

  it('finds web overrides', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.web.colorsAndType?.customProperties['--color-bg']).toBe('#fafafa');
  });

  it('finds product overrides', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.product.components.find((c) => c.name === 'button')?.usage).toContain(
      'Square corners',
    );
  });

  it('ignores human/ by default', () => {
    const scan = scanBrandRoot(FIXTURE);
    expect(scan.warnings.every((w) => !w.includes('human/'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/scanner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `src/scanner/directory-scanner.ts`**

Implementation outline. Export a `scanBrandRoot(rootDir): Omit<DesignSystemIndex, 'resolved' | 'brandName' | 'brandDescription' | 'brandRoot' | 'lastIndexed'>` that:

- Reads `magic_trick.md` at root → produce `MagicTrick`.
- For each verbal file under `agent/verbal/`, call `parseVerbalDoc` (for `.md`) or `parseYamlFile` (for `audience.yaml`). Map by filename stem.
- Build a `RawContextData` for `base` by parsing `agent/visual/`:
  - `colors_and_type.css` via existing `css-parser`.
  - `components/*.md` via existing `parseComponentMarkdown`.
  - `tokens/*.md` via a new `parseTokenSpecimen` helper added at the bottom of `markdown-parser.ts` (Task 10).
  - `motion/` via `parseMotionDir`.
  - `fonts/` via existing `font-parser` + optional `fonts.yaml`.
  - `assets/` via existing `image-parser` + optional `assets.yaml`.
- Build `web` and `product` `RawContextData` by scanning `agent/visual/artifacts/web/` and `.../product/` with the same file conventions (each is allowed to omit anything).
- Collect every parser warning into `warnings: string[]`.
- Honor an `ignore: string[]` arg (defaulting to `['human/']`) — paths matching are skipped.

Show full implementation in the plan; placeholders for sub-helpers OK only when those helpers are defined elsewhere in this plan. Refer to existing parser signatures in `src/parsers/`. The function should be ~150-200 lines.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/scanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanner/directory-scanner.ts src/tests/scanner.test.ts
git commit -m "feat(scanner): walk v2 brand_atomic_system layout"
```

---

### Task 10: Token specimen parser

**Files:**
- Modify: `src/parsers/markdown-parser.ts`
- Modify: `src/tests/verbal-parser.test.ts` (extend or add a sibling file `token-parser.test.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/tests/token-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseTokenSpecimen } from '../parsers/markdown-parser.js';

function md(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-tok-'));
  const path = join(dir, 'token.md');
  writeFileSync(path, content);
  return path;
}

describe('parseTokenSpecimen', () => {
  it('parses well-formed frontmatter', () => {
    const path = md('---\nname: color-primary\nvalue: "#1a1a2e"\ntype: color\n---\n# color-primary\n');
    const result = parseTokenSpecimen(path);
    expect(result.specimen?.name).toBe('color-primary');
    expect(result.specimen?.value).toBe('#1a1a2e');
    expect(result.warnings).toEqual([]);
  });

  it('warns and returns null when required frontmatter missing', () => {
    const path = md('# title only, no frontmatter\n');
    const result = parseTokenSpecimen(path);
    expect(result.specimen).toBeNull();
    expect(result.warnings.some((w) => /name|value|type/.test(w))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/token-parser.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add `parseTokenSpecimen` to `src/parsers/markdown-parser.ts`**

```ts
import type { TokenSpecimen } from '../types/design-system.js';

export interface TokenSpecimenResult {
  specimen: TokenSpecimen | null;
  warnings: string[];
}

export function parseTokenSpecimen(filePath: string): TokenSpecimenResult {
  const warnings: string[] = [];
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return { specimen: null, warnings: [`Could not read ${filePath}`] };
  }
  const { data, content } = matter(raw);
  const name = data.name as string | undefined;
  const value = data.value as string | undefined;
  const type = data.type as string | undefined;
  if (!name || !value || !type) {
    warnings.push(
      `Token specimen at ${filePath} missing required frontmatter (name/value/type); skipping`,
    );
    return { specimen: null, warnings };
  }
  return {
    specimen: {
      name,
      value,
      type,
      role: data.role as string | undefined,
      related: data.related as string[] | undefined,
      body: content.trim(),
      source: filePath,
    },
    warnings,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/token-parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/markdown-parser.ts src/tests/token-parser.test.ts
git commit -m "feat(parsers): parseTokenSpecimen for v2 tokens/ specimens"
```

---

### Task 11: Context resolver rewrite

**Files:**
- Modify: `src/context-resolver.ts`
- Create: `src/tests/resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { scanBrandRoot } from '../scanner/directory-scanner.js';
import { resolveAll } from '../context-resolver.js';

const FIXTURE = resolve(__dirname, '../../__test_fixtures__/v2/full');

describe('resolveAll', () => {
  it('produces base/web/product views', () => {
    const scan = scanBrandRoot(FIXTURE);
    const resolved = resolveAll(scan, { brandName: 'Acme' });

    expect(resolved.base.colors.find((c) => c.token === '--color-bg')?.value).toBe('#ffffff');
    expect(resolved.web.colors.find((c) => c.token === '--color-bg')?.value).toBe('#fafafa');
    expect(resolved.product.components.find((c) => c.name === 'button')?.usage).toContain(
      'Square corners',
    );
  });

  it('falls through to base for files not present in override', () => {
    const scan = scanBrandRoot(FIXTURE);
    const resolved = resolveAll(scan, { brandName: 'Acme' });
    expect(resolved.web.components.find((c) => c.name === 'button')?.usage).not.toContain(
      'Square corners',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/resolver.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `src/context-resolver.ts`**

Replace the file. Key exports:

- `resolveAll(scan, opts): Record<BrandContext, ResolvedDesignSystem>` — builds three views.
- Internal `mergeContext(base, override): RawContextData` — file-level merge using existing `mergeByKey` for arrays; override `colorsAndType` if present.
- A `materialize(raw, ctx, brandName, brandDescription): ResolvedDesignSystem` adapter that maps the new `RawContextData` shape into the existing `ResolvedDesignSystem` fields (colors come from `colorsAndType.customProperties` filtered by `--color-*` prefix; typography from `--font-*`/`--type-*` prefix; assets become `textures` until the type is renamed in a future cleanup task).
  - For v2, `ResolvedDesignSystem` still uses the existing field names (`colors`, `typography`, etc.) to keep `search_brand` and `validate_usage` rewriting smaller. Internal mapping is the only adapter point.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context-resolver.ts src/tests/resolver.test.ts
git commit -m "feat(resolver): base/web/product merge for v2"
```

---

### Task 12: Indexer wiring + brandkit.config.yaml -> root path

**Files:**
- Modify: `src/indexer/index.ts`

- [ ] **Step 1: Read current indexer entry point**

Run: `cat src/indexer/index.ts`

- [ ] **Step 2: Update it to call `scanBrandRoot` + `resolveAll`**

The function exported as the indexer's main builder should now:

1. Compute `brandRoot = resolve(configPath, '..', config.brand.root)`.
2. Call `scanBrandRoot(brandRoot, { ignore: config.ignore })`.
3. Call `resolveAll(scan, { brandName: config.brand.name, brandDescription: config.brand.description })`.
4. Return a `DesignSystemIndex` matching the new shape in `src/indexer/types.ts`.

- [ ] **Step 3: Verify typecheck and existing tests**

Run: `npx tsc --noEmit`
Expected: errors in `src/tools/get-*.ts` (handled in subsequent tasks). Mark the failing tools as known issues.

Run: `npx vitest run src/tests/scanner.test.ts src/tests/resolver.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/indexer/index.ts
git commit -m "feat(indexer): wire v2 scanner+resolver into index builder"
```

---

### Task 13: Rewrite `examples/acme-corp/` and `templates/starter/`

**Files:**
- Delete: `examples/acme-corp/brand/`
- Create: `examples/acme-corp/brand_atomic_system/` (whole tree)
- Modify: `examples/acme-corp/brandkit.config.yaml`
- Delete: `templates/starter/brand/`
- Create: `templates/starter/brand_atomic_system/`
- Modify: `templates/starter/brandkit.config.yaml`

- [ ] **Step 1: Delete v1 trees**

```bash
git rm -r examples/acme-corp/brand templates/starter/brand
```

- [ ] **Step 2: Build acme-corp v2 tree**

Recreate the same shape as `__test_fixtures__/v2/full/` under `examples/acme-corp/brand_atomic_system/`, but with realistic, fleshed-out content for acme-corp (a fictional B2B SaaS). Populate every file listed in the spec's canonical layout. Include 3-5 token specimens (color-primary, color-bg, font-display, font-body, radius-default), 2-3 components (button, card, modal), populated audience.yaml with 2-3 personas, a real-feeling magic_trick.md, etc.

- [ ] **Step 3: Build templates/starter v2 tree**

Same shape, but with minimal placeholder content (each file says "Replace this with your X").

- [ ] **Step 4: Update `examples/acme-corp/brandkit.config.yaml`**

```yaml
version: 2
brand:
  name: Acme Corp
  description: Plumbing for builders.
  root: ./brand_atomic_system
```

`templates/starter/brandkit.config.yaml` should follow the same shape but with `name: Your Brand`.

- [ ] **Step 5: Verify scanner against the example**

Run from the repo root:

```bash
npx vitest run src/tests/scanner.test.ts
node -e "import('./src/indexer/index.js').then(m => m.buildIndex('./examples/acme-corp/brandkit.config.yaml').then(i => console.log(JSON.stringify(i.warnings, null, 2))))"
```

Expected: scanner test still passes; the example brand prints `[]` (no warnings).

- [ ] **Step 6: Commit**

```bash
git add examples/acme-corp templates/starter
git commit -m "feat(examples,templates): rewrite to v2 brand_atomic_system layout"
```

---

### Task 14: Test helper `buildFixtureIndex`

**Files:**
- Create: `src/tests/helpers.ts`

- [ ] **Step 1: Write the helper**

```ts
// src/tests/helpers.ts
import { resolve } from 'path';
import { scanBrandRoot } from '../scanner/directory-scanner.js';
import { resolveAll } from '../context-resolver.js';
import type { DesignSystemIndex } from '../indexer/types.js';

export function buildFixtureIndex(name: 'v2/full' | 'v2/empty'): DesignSystemIndex {
  const root = resolve(__dirname, '../..', '__test_fixtures__', name);
  const scan = scanBrandRoot(root);
  const resolved = resolveAll(scan, { brandName: 'Test Brand' });
  return {
    brandName: 'Test Brand',
    brandRoot: root,
    lastIndexed: new Date('2026-05-14T00:00:00Z'),
    magicTrick: scan.magicTrick,
    verbal: scan.verbal,
    base: scan.base,
    web: scan.web,
    product: scan.product,
    resolved,
    warnings: scan.warnings,
  };
}
```

- [ ] **Step 2: Sanity test**

Add `src/tests/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';

describe('buildFixtureIndex', () => {
  it('builds a complete v2/full index', () => {
    const idx = buildFixtureIndex('v2/full');
    expect(idx.magicTrick?.content).toContain('Specificity');
    expect(idx.verbal.positioning?.body).toContain('solo founders');
  });

  it('builds an empty v2/empty index without throwing', () => {
    const idx = buildFixtureIndex('v2/empty');
    expect(idx.magicTrick).toBeUndefined();
    expect(idx.verbal.positioning).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run**

Run: `npx vitest run src/tests/helpers.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tests/helpers.ts src/tests/helpers.test.ts
git commit -m "test: buildFixtureIndex helper for tool tests"
```

---

# Phase 2 — Tool surface

Goal: 18 MCP tools registered, callable, and exercised by tests. Old v1 tools deleted.

---

### Task 15: Taste-primer helper

**Files:**
- Create: `src/tools/_taste-primer.ts`
- Create: `src/tests/taste-primer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/taste-primer.test.ts
import { describe, it, expect } from 'vitest';
import { attachTastePrimer } from '../tools/_taste-primer.js';
import { buildFixtureIndex } from './helpers.js';

describe('attachTastePrimer', () => {
  it('adds _taste_primer with magic_trick contents', () => {
    const idx = buildFixtureIndex('v2/full');
    const out = attachTastePrimer({ content: 'hi' }, idx) as { _taste_primer?: string };
    expect(out._taste_primer).toContain('Specificity beats abstraction');
  });

  it('adds _taste_primer: null when magic_trick.md missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const out = attachTastePrimer({ content: 'hi' }, idx) as { _taste_primer?: string | null };
    expect(out._taste_primer).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/taste-primer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/_taste-primer.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/taste-primer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/_taste-primer.ts src/tests/taste-primer.test.ts
git commit -m "feat(tools): _taste-primer helper for creative tools"
```

---

### Task 16: `get_magic_trick` tool

**Files:**
- Create: `src/tools/get-magic-trick.ts`
- Modify: `src/tests/tools-verbal.test.ts` (create it)

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/tools-verbal.test.ts
import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as magicTrick from '../tools/get-magic-trick.js';

describe('get_magic_trick', () => {
  it('returns the file content verbatim', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = magicTrick.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toContain('Specificity beats abstraction');
    expect(parsed.source).toMatch(/magic_trick\.md$/);
    expect(parsed._warnings).toEqual([]);
  });

  it('returns a warning when missing', () => {
    const idx = buildFixtureIndex('v2/empty');
    const [result] = magicTrick.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.content).toBe('');
    expect(parsed._warnings[0]).toMatch(/magic_trick/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/tools-verbal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/get-magic-trick.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/tools-verbal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-magic-trick.ts src/tests/tools-verbal.test.ts
git commit -m "feat(tools): get_magic_trick"
```

---

### Task 17: `get_positioning` tool

**Files:**
- Create: `src/tools/get-positioning.ts`
- Modify: `src/tests/tools-verbal.test.ts`

- [ ] **Step 1: Apply the Verbal-prose markdown tool recipe**

Use the recipe at the top of this plan with:
- `<name>` = `positioning`
- `<key>` = `positioning`
- `<one-liner>` = `"Return the brand's positioning document (agent/verbal/positioning.md). Includes a taste primer from magic_trick.md."`

- [ ] **Step 2: Add the test describe block from the recipe to `src/tests/tools-verbal.test.ts`**

- [ ] **Step 3: Run**

Run: `npx vitest run src/tests/tools-verbal.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/get-positioning.ts src/tests/tools-verbal.test.ts
git commit -m "feat(tools): get_positioning"
```

---

### Tasks 18-21: `get_messaging`, `get_differentiation`, `get_concepts`, `get_voice`

Each task is identical to Task 17, parameterised by name:

| Task | Tool | Key | Description |
|---|---|---|---|
| 18 | `get_messaging` | `messaging` | Return the brand's messaging document (agent/verbal/messaging.md). Includes a taste primer. |
| 19 | `get_differentiation` | `differentiation` | Return the brand's differentiation document. Includes a taste primer. |
| 20 | `get_concepts` | `concepts` | Return the brand's creative concepts/directions (agent/verbal/concepts.md). Includes a taste primer. |
| 21 | `get_voice` | `voice` | Return the brand's voice document (agent/verbal/voice.md). Includes a taste primer. |

Each task:

- [ ] Apply the recipe — create the file, add the test describe block.
- [ ] Run `npx vitest run src/tests/tools-verbal.test.ts`. Expected: PASS.
- [ ] Commit: `git add src/tools/get-<name>.ts src/tests/tools-verbal.test.ts && git commit -m "feat(tools): get_<name>"`.

---

### Task 22: `get_audience` tool (YAML-aware)

**Files:**
- Create: `src/tools/get-audience.ts`
- Modify: `src/tests/tools-verbal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('get_audience', () => {
  it('returns parsed YAML with a taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = audience.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.data.personas).toHaveLength(1);
    expect(parsed._taste_primer).toContain('Specificity');
    expect(parsed._warnings).toEqual([]);
  });
});
```

(Import: `import * as audience from '../tools/get-audience.js'`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/tools-verbal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/get-audience.ts`**

```ts
import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_audience';

export const TOOL_DESCRIPTION =
  'Return the brand\'s audience definition parsed from agent/verbal/audience.yaml. Freeform YAML; returned as-is. Includes a taste primer.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function handler(index: DesignSystemIndex) {
  const warnings: string[] = [];
  const doc = index.verbal.audience;
  if (!doc) warnings.push('No audience document found at agent/verbal/audience.yaml');

  const payload = attachTastePrimer(
    {
      data: doc?.data ?? null,
      source: doc?.source,
      _warnings: warnings,
    },
    index,
  );
  return [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }];
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/tests/tools-verbal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-audience.ts src/tests/tools-verbal.test.ts
git commit -m "feat(tools): get_audience"
```

---

### Task 23: `get_colors_and_type` tool

**Files:**
- Create: `src/tools/get-colors-and-type.ts`
- Create: `src/tests/tools-visual.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/tools-visual.test.ts
import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as cat from '../tools/get-colors-and-type.js';

describe('get_colors_and_type', () => {
  it('returns base custom properties', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.customProperties['--color-primary']).toBe('#1a1a2e');
  });

  it('honors web override', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'web' });
    const parsed = JSON.parse(result.text);
    expect(parsed.customProperties['--color-bg']).toBe('#fafafa');
  });

  it('omits _taste_primer (visual tool)', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = cat.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed._taste_primer).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/get-colors-and-type.ts`**

```ts
import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';

export const TOOL_NAME = 'get_colors_and_type';

export const TOOL_DESCRIPTION =
  'Return colors and typography as CSS custom properties from agent/visual/colors_and_type.css (with optional artifact override).';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const ctx = args.context ?? 'base';
  const warnings: string[] = [];
  const file = index[ctx].colorsAndType ?? index.base.colorsAndType;
  if (!file) warnings.push('No colors_and_type.css found');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          context: ctx,
          customProperties: file?.customProperties ?? {},
          source: file?.filePath,
          _warnings: warnings,
        },
        null,
        2,
      ),
    },
  ];
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-colors-and-type.ts src/tests/tools-visual.test.ts
git commit -m "feat(tools): get_colors_and_type"
```

---

### Task 24: `get_assets` tool

**Files:**
- Create: `src/tools/get-assets.ts`
- Modify: `src/tests/tools-visual.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('get_assets', () => {
  it('lists base assets including logo-primary', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = assets.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.assets.find((a: { id?: string }) => a.id === 'logo-primary')).toBeTruthy();
  });
});
```

(Import: `import * as assets from '../tools/get-assets.js'`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/get-assets.ts`**

Same shape as `get_colors_and_type` but returning `index[ctx].assets` (falling through to base for unset overrides). No taste primer.

```ts
import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';

export const TOOL_NAME = 'get_assets';

export const TOOL_DESCRIPTION =
  'Return logos and other binary assets from agent/visual/assets/. Replaces v1 get_logos + get_textures.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const ctx = args.context ?? 'base';
  const warnings: string[] = [];
  const list = index[ctx].assets.length ? index[ctx].assets : index.base.assets;
  if (list.length === 0) warnings.push('No assets found');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify({ context: ctx, assets: list, _warnings: warnings }, null, 2),
    },
  ];
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-assets.ts src/tests/tools-visual.test.ts
git commit -m "feat(tools): get_assets"
```

---

### Task 25: `get_fonts` tool

**Files:**
- Create: `src/tools/get-fonts.ts`
- Modify: `src/tests/tools-visual.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('get_fonts', () => {
  it('returns the parsed font faces', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = fonts.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.faces[0].family).toBe('Söhne');
  });
});
```

(Import: `import * as fonts from '../tools/get-fonts.js'`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/get-fonts.ts`**

```ts
import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';

export const TOOL_NAME = 'get_fonts';

export const TOOL_DESCRIPTION =
  'Return font faces declared in agent/visual/fonts/ (binary files + optional fonts.yaml manifest).';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const ctx = args.context ?? 'base';
  const warnings: string[] = [];
  const faces = index[ctx].fonts.length ? index[ctx].fonts : index.base.fonts;
  if (faces.length === 0) warnings.push('No font faces discovered');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify({ context: ctx, faces, _warnings: warnings }, null, 2),
    },
  ];
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/tests/tools-visual.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-fonts.ts src/tests/tools-visual.test.ts
git commit -m "feat(tools): get_fonts"
```

---

### Task 26: `get_motion` tool

**Files:**
- Create: `src/tools/get-motion.ts`
- Modify: `src/tests/tools-visual.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('get_motion', () => {
  it('returns parsed tokens + raw css', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = motion.handler(idx, {});
    const parsed = JSON.parse(result.text);
    expect((parsed.tokens.durations as { fast: string }).fast).toBe('120ms');
    expect(parsed.css).toContain('@keyframes fade-in');
  });
});
```

(Import: `import * as motion from '../tools/get-motion.js'`.)

- [ ] **Step 2: Implement `src/tools/get-motion.ts`**

```ts
import type { DesignSystemIndex } from '../indexer/types.js';
import type { BrandContext } from '../types/design-system.js';

export const TOOL_NAME = 'get_motion';

export const TOOL_DESCRIPTION =
  'Return the motion system: parsed motion.json tokens + motion.css text.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    context: { type: 'string', enum: ['base', 'web', 'product'], default: 'base' },
  },
};

export function handler(index: DesignSystemIndex, args: { context?: BrandContext }) {
  const ctx = args.context ?? 'base';
  const motion = index[ctx].motion ?? index.base.motion;
  const warnings: string[] = [];
  if (!motion) warnings.push('No motion system found at agent/visual/motion/');
  return [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          context: ctx,
          tokens: motion?.tokens ?? null,
          css: motion?.css ?? '',
          source: motion?.source,
          _warnings: warnings,
        },
        null,
        2,
      ),
    },
  ];
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/tools-visual.test.ts
git add src/tools/get-motion.ts src/tests/tools-visual.test.ts
git commit -m "feat(tools): get_motion"
```

---

### Task 27: Update `get_components` for v2 path

**Files:**
- Modify: `src/tools/get-components.ts`

- [ ] **Step 1: Read existing implementation**

Run: `cat src/tools/get-components.ts`

- [ ] **Step 2: Update**

Change the context arg enum to `['base', 'web', 'product']`. Source components from `index[ctx].components` (falling through to base for unset overrides). Add a `_warnings: []` field to the response. No taste primer.

- [ ] **Step 3: Add test**

In `src/tests/tools-visual.test.ts`:

```ts
describe('get_components', () => {
  it('returns base button', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = components.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.components.find((c: { name: string }) => c.name === 'button')).toBeTruthy();
  });

  it('applies product override', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = components.handler(idx, { context: 'product' });
    const parsed = JSON.parse(result.text);
    expect(parsed.components.find((c: { name: string }) => c.name === 'button')?.usage).toContain(
      'Square corners',
    );
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/tools-visual.test.ts
git add src/tools/get-components.ts src/tests/tools-visual.test.ts
git commit -m "feat(tools): update get_components for v2 context model"
```

---

### Task 28: Update `get_tokens` for v2 specimens

**Files:**
- Modify: `src/tools/get-tokens.ts`

- [ ] **Step 1: Update**

Read tokens from `index[ctx].tokens` (the `TokenSpecimen[]` populated by the scanner). Keep format options (`json | css | scss | tailwind | w3c`) the same. Treat missing/malformed specimens as warnings, not errors.

- [ ] **Step 2: Add test in tools-visual.test.ts**

```ts
describe('get_tokens', () => {
  it('aggregates token specimens', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = tokens.handler(idx, { context: 'base', format: 'json' });
    const parsed = JSON.parse(result.text);
    expect(parsed.tokens.find((t: { name: string }) => t.name === 'color-primary')?.value).toBe(
      '#1a1a2e',
    );
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/tools-visual.test.ts
git add src/tools/get-tokens.ts src/tests/tools-visual.test.ts
git commit -m "feat(tools): update get_tokens for v2 specimens"
```

---

### Task 29: Update `get_css`

**Files:**
- Modify: `src/tools/get-css.ts`

- [ ] **Step 1: Update**

Return `{ colors_and_type: string, motion: string, _warnings: [] }` for the requested context. Drop the previous "list of cssFiles" shape.

- [ ] **Step 2: Add test**

```ts
describe('get_css', () => {
  it('returns colors_and_type + motion text', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = css.handler(idx, { context: 'base' });
    const parsed = JSON.parse(result.text);
    expect(parsed.colors_and_type).toContain('--color-primary');
    expect(parsed.motion).toContain('@keyframes fade-in');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/tools-visual.test.ts
git add src/tools/get-css.ts src/tests/tools-visual.test.ts
git commit -m "feat(tools): update get_css to return structured { colors_and_type, motion }"
```

---

### Task 30: Update `get_brand_overview` (taste primer + new tool list)

**Files:**
- Modify: `src/tools/get-brand-overview.ts`
- Create: `src/tests/tools-overview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/tools-overview.test.ts
import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import * as overview from '../tools/get-brand-overview.js';

describe('get_brand_overview', () => {
  it('lists 18 tools', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.availableTools).toHaveLength(18);
  });

  it('includes taste primer', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed._taste_primer).toContain('Specificity');
  });

  it('reports asset inventory with v2 categories', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = overview.handler(idx);
    const parsed = JSON.parse(result.text);
    expect(parsed.inventory.tokens).toBe(1);
    expect(parsed.inventory.components).toBe(1);
    expect(parsed.inventory.fonts).toBe(1);
    expect(parsed.inventory.motion).toBe(true);
    expect(parsed.inventory.verbal.positioning).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/tools-overview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `src/tools/get-brand-overview.ts`**

```ts
import type { DesignSystemIndex } from '../indexer/types.js';
import { attachTastePrimer } from './_taste-primer.js';

export const TOOL_NAME = 'get_brand_overview';
export const TOOL_DESCRIPTION =
  'High-level overview of the brand atomic system: brand name, magic_trick presence, inventory counts, contexts, and the full v2 tool list.';
export const INPUT_SCHEMA = { type: 'object' as const, properties: {} };

const TOOLS = [
  ['get_brand_overview',  'High-level overview + taste primer'],
  ['get_magic_trick',     'Verbatim magic_trick.md'],
  ['get_positioning',     'Positioning document'],
  ['get_audience',        'Audience YAML, parsed'],
  ['get_messaging',       'Messaging document'],
  ['get_differentiation', 'Differentiation document'],
  ['get_concepts',        'Creative concepts/directions'],
  ['get_voice',           'Voice document'],
  ['get_colors_and_type', 'Colors + typography custom properties'],
  ['get_assets',          'Logos + brand assets (replaces v1 get_logos + get_textures)'],
  ['get_fonts',           'Font faces from fonts/'],
  ['get_components',      'UI primitives'],
  ['get_tokens',          'Token specimens'],
  ['get_motion',          'Motion system (json + css)'],
  ['get_css',             'colors_and_type.css + motion.css text'],
  ['search_brand',        'Full-text search'],
  ['validate_usage',      'Validate brand compliance'],
  ['get_context_diff',    'Diff base vs web vs product'],
] as const;

export function handler(index: DesignSystemIndex) {
  const payload = {
    name: index.brandName,
    description: index.brandDescription,
    lastIndexed: index.lastIndexed.toISOString(),
    contexts: ['base', 'web', 'product'],
    inventory: {
      tokens: index.base.tokens.length,
      components: index.base.components.length,
      fonts: index.base.fonts.length,
      assets: index.base.assets.length,
      motion: index.base.motion != null,
      verbal: {
        positioning: index.verbal.positioning != null,
        audience: index.verbal.audience != null,
        messaging: index.verbal.messaging != null,
        differentiation: index.verbal.differentiation != null,
        concepts: index.verbal.concepts != null,
        voice: index.verbal.voice != null,
      },
      magicTrick: index.magicTrick != null,
    },
    availableTools: TOOLS.map(([name, description]) => ({ name, description })),
    _warnings: index.warnings,
  };
  return [
    {
      type: 'text' as const,
      text: JSON.stringify(attachTastePrimer(payload, index), null, 2),
    },
  ];
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/tools-overview.test.ts
git add src/tools/get-brand-overview.ts src/tests/tools-overview.test.ts
git commit -m "feat(tools): rewrite get_brand_overview for v2 (18-tool list + taste primer)"
```

---

### Task 31: Update `search_brand`

**Files:**
- Modify: `src/tools/search-brand.ts`

- [ ] **Step 1: Read existing implementation**

Run: `cat src/tools/search-brand.ts`

- [ ] **Step 2: Update the index it searches**

Replace the v1 sources (`index.shared.guidelines`, etc.) with v2 sources:

- All `index.verbal.*` docs (body + frontmatter values stringified)
- `index.magicTrick?.content`
- `index.base.components`, `index.web.components`, `index.product.components`
- `index.base.tokens` (body + name + value + role)
- `index.base.assets` (file + purpose)

Keep the same input schema and result shape.

- [ ] **Step 3: Add test in `src/tests/tools-overview.test.ts`**

```ts
import * as search from '../tools/search-brand.js';

describe('search_brand', () => {
  it('finds matches in verbal positioning', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = search.handler(idx, { query: 'solo founders' });
    const parsed = JSON.parse(result.text);
    expect(parsed.results.some((r: { source?: string }) => r.source?.includes('positioning.md'))).toBe(true);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/tools-overview.test.ts
git add src/tools/search-brand.ts src/tests/tools-overview.test.ts
git commit -m "feat(tools): reindex search_brand against v2"
```

---

### Task 32: Update `validate_usage`

**Files:**
- Modify: `src/tools/validate-usage.ts`

- [ ] **Step 1: Update**

Validation should look at `index.base.tokens` (the new specimen list) for hex value validity and `index.base.components` for component name lookup. Drop any reference to `marketing | product | shared`. Use the existing input shape (HTML/CSS snippet → warnings).

- [ ] **Step 2: Add test**

```ts
import * as validate from '../tools/validate-usage.js';

describe('validate_usage', () => {
  it('flags a non-token color', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = validate.handler(idx, { snippet: '.btn { color: #abcdef; }' });
    const parsed = JSON.parse(result.text);
    expect(parsed.violations.length).toBeGreaterThan(0);
  });

  it('accepts a token color', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = validate.handler(idx, { snippet: '.btn { color: var(--color-primary); }' });
    const parsed = JSON.parse(result.text);
    expect(parsed.violations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/tools-overview.test.ts
git add src/tools/validate-usage.ts src/tests/tools-overview.test.ts
git commit -m "feat(tools): re-target validate_usage for v2 tokens"
```

---

### Task 33: Update `get_context_diff`

**Files:**
- Modify: `src/tools/get-context-diff.ts`

- [ ] **Step 1: Update**

Accept `{ a?: BrandContext; b?: BrandContext }` (defaulting to `a: 'web'`, `b: 'product'`). Diff `resolved[a]` vs `resolved[b]` along: colors_and_type custom properties, components by name, tokens by name.

- [ ] **Step 2: Add test**

```ts
import * as diff from '../tools/get-context-diff.js';

describe('get_context_diff', () => {
  it('diffs web vs product', () => {
    const idx = buildFixtureIndex('v2/full');
    const [result] = diff.handler(idx, { a: 'web', b: 'product' });
    const parsed = JSON.parse(result.text);
    expect(parsed.changed.length + parsed.onlyInA.length + parsed.onlyInB.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/tools-overview.test.ts
git add src/tools/get-context-diff.ts src/tests/tools-overview.test.ts
git commit -m "feat(tools): get_context_diff over base|web|product"
```

---

### Task 34: Register new tool surface; delete v1 tools

**Files:**
- Modify: `src/tools/index.ts`
- Delete: `src/tools/get-colors.ts`, `get-typography.ts`, `get-textures.ts`, `get-logos.ts`, `get-guidelines.ts`

- [ ] **Step 1: Rewrite `src/tools/index.ts`**

Imports + ALL_TOOLS list must include exactly these 18 modules:

```ts
import * as brandOverview     from './get-brand-overview.js';
import * as magicTrick        from './get-magic-trick.js';
import * as positioning       from './get-positioning.js';
import * as audience          from './get-audience.js';
import * as messaging         from './get-messaging.js';
import * as differentiation   from './get-differentiation.js';
import * as concepts          from './get-concepts.js';
import * as voice             from './get-voice.js';
import * as colorsAndType     from './get-colors-and-type.js';
import * as assets            from './get-assets.js';
import * as fonts             from './get-fonts.js';
import * as components        from './get-components.js';
import * as tokens            from './get-tokens.js';
import * as motion            from './get-motion.js';
import * as css               from './get-css.js';
import * as searchBrand       from './search-brand.js';
import * as validateUsage     from './validate-usage.js';
import * as contextDiff       from './get-context-diff.js';
```

Update the `CallToolRequestSchema` switch to dispatch to each tool's `handler`.

- [ ] **Step 2: Delete v1 tools**

```bash
git rm src/tools/get-colors.ts src/tools/get-typography.ts src/tools/get-textures.ts src/tools/get-logos.ts src/tools/get-guidelines.ts
```

- [ ] **Step 3: Update `src/types/mcp.ts`**

Remove the old args interfaces (`GetColorsArgs`, `GetTypographyArgs`, etc.). Add new ones inline-typed in each tool, or export from `mcp.ts` if the team prefers central args:

```ts
export interface ContextOnlyArgs { context?: 'base' | 'web' | 'product' }
export interface ContextDiffArgs { a?: 'base' | 'web' | 'product'; b?: 'base' | 'web' | 'product' }
export interface SearchArgs { query: string; limit?: number }
export interface ValidateArgs { snippet: string; format?: 'html' | 'css' }
export interface TokensArgs extends ContextOnlyArgs { format?: 'json' | 'css' | 'scss' | 'tailwind' | 'w3c' }
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add src/tools/index.ts src/types/mcp.ts
git commit -m "feat(tools): register v2 18-tool surface; remove v1 tools"
```

---

### Task 35: Resources — new URIs

**Files:**
- Modify: `src/resources/index.ts`

- [ ] **Step 1: Read existing resource listing**

Run: `cat src/resources/index.ts`

- [ ] **Step 2: Rewrite to list new URIs**

`listResources(index)` should expose:

```
brand://overview
brand://magic_trick
brand://verbal/positioning
brand://verbal/audience
brand://verbal/messaging
brand://verbal/differentiation
brand://verbal/concepts
brand://verbal/voice
brand://visual/colors_and_type
brand://visual/components
brand://visual/tokens
brand://visual/motion
brand://visual/fonts
brand://visual/assets
```

`readResource(uri, index)` switches on the URI prefix and returns the corresponding payload (re-using tool handlers where convenient).

- [ ] **Step 3: Smoke test**

Add `src/tests/resources.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFixtureIndex } from './helpers.js';
import { listResources, readResource } from '../resources/index.js';

describe('resources', () => {
  it('lists 14 brand:// URIs', () => {
    const idx = buildFixtureIndex('v2/full');
    expect(listResources(idx)).toHaveLength(14);
  });

  it('reads brand://magic_trick', async () => {
    const idx = buildFixtureIndex('v2/full');
    const res = await readResource('brand://magic_trick', idx);
    expect(res.contents[0].text).toContain('Specificity');
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/resources.test.ts
git add src/resources/index.ts src/tests/resources.test.ts
git commit -m "feat(resources): expose v2 brand:// URIs"
```

---

### Task 36: Audit prompts for v1 vocabulary

**Files:**
- Modify: `src/prompts/index.ts`

- [ ] **Step 1: grep for old vocabulary**

```bash
rg "marketing|shared context|product context" src/prompts/
```

- [ ] **Step 2: Replace references**

Update every prompt template that references `marketing | product | shared` to use `web | product | base`. Update any references to `get_colors`, `get_typography`, `get_logos`, `get_textures`, `get_guidelines` to point at their v2 replacements.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/prompts/
git commit -m "chore(prompts): update vocabulary for v2"
```

---

# Phase 3 — Docs and release

---

### Task 37: Rewrite `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the Repository Structure section**

Replace the v1 directory tree with the v2 canonical layout from the design spec. Replace the tool list with the 18-tool v2 list. Replace the Key Concepts table with the v2 vocabulary (Atomic System, Verbal, Visual, Artifact, Magic Trick, Taste Primer).

- [ ] **Step 2: Add a "Migrating from v1" section**

Map each v1 path to its v2 home:

| v1 path | v2 path |
|---|---|
| `brand/shared/colors/*.css` | `agent/visual/colors_and_type.css` |
| `brand/shared/typography/*.css` | `agent/visual/colors_and_type.css` |
| `brand/shared/logos/*` | `agent/visual/assets/` |
| `brand/shared/components/*.md` | `agent/visual/components/*.md` |
| `brand/shared/voice/brand-voice.md` | `agent/verbal/voice.md` |
| `brand/shared/guidelines/*.md` | `agent/verbal/{positioning,messaging,differentiation,concepts}.md` |
| `brand/marketing/*` | `agent/visual/artifacts/web/*` |
| `brand/product/*` | `agent/visual/artifacts/product/*` |

- [ ] **Step 3: Update install/quickstart**

The "Hello world" section uses the new template structure.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for v2 brand atomic system"
```

---

### Task 38: Rewrite `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace Repository Structure**

Use the v2 tree.

- [ ] **Step 2: Replace Key Concepts table**

```markdown
| Term | Meaning |
|------|---------|
| **Atomic system** | The full v2 layout under `<brand-root>/` — readme, magic_trick, human/, agent/. |
| **Verbal** | Brand language: positioning, audience, messaging, differentiation, concepts, voice. Single source of truth — no context overrides. |
| **Visual** | Brand visual atoms: colors_and_type, fonts, assets, components, tokens, motion. Context overrides live under `artifacts/`. |
| **Context** | `base`, `web`, or `product`. Visual content can be overridden per context; verbal cannot. |
| **Artifact** | A context-specific visual override layer (`agent/visual/artifacts/{web,product}/`). |
| **Magic trick** | Human-authored taste primer at `<brand-root>/magic_trick.md`. Read by creative/verbal tools and injected into their responses. Never written by AI. |
| **Taste primer** | The `_taste_primer` field added by creative/verbal tools, carrying `magic_trick.md` verbatim. |
| **Token specimen** | One markdown file per token in `agent/visual/tokens/`. Frontmatter carries the canonical value. |
```

- [ ] **Step 3: Add the magic_trick write-protection rule**

Inside CLAUDE.md, in a new "Conventions" section:

> **Never write to `magic_trick.md`.** This file is human-authored. The MCP exposes no write tools today; if write capabilities are added in the future, `magic_trick.md` MUST be on the path denylist.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md for v2 brand atomic system"
```

---

### Task 39: Update `RELEASING.md`

**Files:**
- Modify: `RELEASING.md`

- [ ] **Step 1: Add 2.0.0 entry**

```markdown
## 2.0.0 (breaking)

- **Layout:** `brand/{shared,marketing,product}/...` replaced with `<brand-root>/{human,agent/{verbal,visual}}/...`
- **Context vocabulary:** `shared|marketing|product` → `base|web|product`
- **Tool surface:** v1 (13 tools) → v2 (18 tools). Removed: `get_colors`, `get_typography`, `get_logos`, `get_textures`, `get_guidelines`. Added: `get_magic_trick`, `get_positioning`, `get_audience`, `get_messaging`, `get_differentiation`, `get_concepts`, `get_voice`, `get_colors_and_type`, `get_assets`, `get_fonts`, `get_motion`.
- **Config:** `version: 2` required. v1 configs throw `BrandkitV1ConfigError` at startup.
- **Taste primer:** Creative/verbal tools inject `magic_trick.md` contents as a `_taste_primer` field on their responses.
- **No automated migration:** Manual migration table is in README.md.
```

- [ ] **Step 2: Commit**

```bash
git add RELEASING.md
git commit -m "docs(release): 2.0.0 changelog entry"
```

---

### Task 40: Bump `package.json` to 2.0.0

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit version**

Change `"version": "0.1.0"` to `"version": "2.0.0"`.

- [ ] **Step 2: Final test + typecheck + lint**

Run:

```bash
npx tsc --noEmit
npx vitest run
npx eslint src --ext .ts
npm run build
```

All four must pass.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump to 2.0.0"
```

---

## Self-Review

### Spec coverage

Walking the spec section by section:

- **Canonical layout** → Tasks 7 (fixtures), 13 (examples/template).
- **Path-level rules** (`human/` ignored, no verbal overrides, override-by-name) → Task 9 (scanner) + Task 11 (resolver).
- **Context model** (`base|web|product`) → Tasks 1 (types), 2 (config), 11 (resolver).
- **File schemas** for `audience.yaml`, verbal markdown, `colors_and_type.css`, components, token specimens, motion, fonts, assets → Tasks 4, 5, 6, 7, 9, 10.
- **`artifacts/{web,product}/`** override behavior → Tasks 9, 11.
- **Config v2** → Tasks 2, 3, 13.
- **MCP tool surface** (18 tools) → Tasks 15-34.
- **Taste injection** (creative/verbal only) → Tasks 15 (helper), 16-22, 30.
- **Write protection** (documented; no runtime guard) → Tasks 38 (CLAUDE.md), 16 (tool description).
- **Code changes** for `src/types`, `src/config`, `src/scanner`, `src/parsers`, `src/context-resolver`, `src/tools`, `src/resources`, `src/prompts`, `src/index.ts`, `src/tests`, `__test_fixtures__`, `examples`, `templates`, README, CLAUDE.md, RELEASING.md → covered across all tasks.
- **Migration** (no automated path; manual table in README) → Task 37.
- **Acceptance criteria** (18 tools, taste primer on 7 tools, scanner ignores human/, v1 config errors, README/CLAUDE updated, tests pass) → all addressed.

### Placeholder scan

No "TBD" / "TODO" / "add appropriate error handling" found in the plan. The scanner rewrite (Task 9) does say "Show full implementation … function should be ~150-200 lines" rather than spelling out every line — that's a soft handoff to the engineer, justified by the orchestration work involving 6 sub-parsers already specified earlier in the plan. Acceptable but flagged here.

### Type consistency

- `BrandContext = 'base' | 'web' | 'product'` — used consistently from Task 1 onward.
- `DesignSystemIndex` shape introduced in Task 8; reused in every tool task; matches the recipe.
- `VerbalDoc`, `AudienceDoc`, `MagicTrick`, `MotionSystem`, `TokenSpecimen`, `AssetEntry`, `FontFace` — all defined in Task 1, consumed in Tasks 9, 11, 15-30 with matching field names.
- `attachTastePrimer(payload, index)` — signature defined in Task 15, called identically in Tasks 17-22, 30.
- `buildFixtureIndex(name)` — defined in Task 14, used by every later test.

No drift found.

### Scope check

Single coherent refactor; one plan is appropriate. Phase boundaries are testable independently: after Phase 1, the foundation builds and scans the new layout; after Phase 2, the full MCP surface is live; after Phase 3, the release is documented and version-bumped.
