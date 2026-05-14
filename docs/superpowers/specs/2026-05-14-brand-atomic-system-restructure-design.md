# Brand Atomic System Restructure — Design Spec

**Date:** 2026-05-14
**Status:** Approved (pending user review of this written spec)
**Scope:** Full breaking refactor of BrandKit MCP file layout, types, parsers, scanner, MCP tool surface, config schema, examples, templates, fixtures, and docs.
**Related release:** v2.0.0

---

## Background

BrandKit MCP today organises brand content under `brand/{shared,marketing,product}/{colors,typography,logos,components,guidelines,voice}`. This design replaces that layout with a "brand atomic system" structure inspired by Emmett Shine's framework, which separates content by **consumer** (human vs agent) and by **modality** (verbal vs visual), with context overrides relocated inside the visual subtree.

The change is breaking. No compatibility shim is shipped; v1 configs fail at startup with a clear migration error.

---

## Goals

- Replace the existing directory layout with a single canonical tree that is easier for both humans and LLM agents to reason about.
- Introduce a clear separation between human-only content (`human/`, PDFs) and agent-readable content (`agent/`).
- Add explicit verbal categories (positioning, audience, messaging, differentiation, concepts, voice) as first-class MCP tools.
- Introduce a `magic_trick.md` "taste primer" that is human-authored, AI-readable, never AI-written, and is automatically injected into the output of creative/verbal tool calls.
- Add a motion system (JSON + CSS) as a first-class category.
- Rename the context axis from `shared | marketing | product` to `base | web | product`, with overrides relocated under `agent/visual/artifacts/{web,product}/`.

## Non-goals

- An automated v1 → v2 migration CLI (`brandkit migrate`). Listed as follow-up.
- Write tools (creating or modifying brand files via the MCP).
- A `get_human_pdfs` tool or any surface over the `human/` directory.
- Schema validation that throws on malformed input. See the Tolerance Principle below.

---

## Tolerance Principle (cross-cutting)

Schemas described in this document are **illustrative, not enforced**. Parsers degrade gracefully:

- Missing frontmatter → infer what is possible from filename/path or skip the item from the tool response with a warning.
- Unfamiliar YAML shape → pass through what was parsed; do not validate against a fixed schema.
- Missing optional manifest (`fonts.yaml`, `assets.yaml`) → list by filename inference.
- Unparseable file → log a warning and continue. The MCP never throws on user content shape.

Tools always return their best-effort result with any warnings included in a `_warnings: string[]` field on the response so callers can surface them.

---

## Canonical layout

```
<brand-root>/
├── readme.md                    # human + agent reference
├── magic_trick.md               # human-authored taste; agent-readable, never AI-written
├── brandkit.config.yaml         # MCP config, version: 2
├── human/                       # PDFs and human-only material; MCP IGNORES by default
│   └── *.pdf
└── agent/
    ├── verbal/                  # single source of truth; no context overrides
    │   ├── positioning.md
    │   ├── audience.yaml
    │   ├── messaging.md
    │   ├── differentiation.md
    │   ├── concepts.md
    │   └── voice.md
    └── visual/                  # base layer
        ├── colors_and_type.css
        ├── fonts/               # .otf/.ttf/.woff(2) + optional fonts.yaml
        ├── assets/              # logos, photos, illustrations + optional assets.yaml
        ├── components/          # one .md per primitive, frontmatter + spec
        ├── tokens/              # one .md per token specimen
        ├── motion/
        │   ├── motion.json
        │   └── motion.css
        └── artifacts/
            ├── web/             # override layer — can shadow any base file by name
            └── product/         # override layer — same
```

### Path-level rules

- `human/` is scanned only when a tool explicitly opts in. Default scanner ignores it.
- `magic_trick.md` is read-only from the MCP's perspective (no write tools exist; rule documented in tool descriptions for future-proofing).
- `agent/verbal/` is global. There are no per-context verbal overrides.
- `agent/visual/artifacts/{web,product}/` may mirror any subset of the `visual/` subtree. Files in an override directory shadow base files by exact relative path match. Files absent from an override fall through to base.

---

## Context model

| Old (v1) | New (v2) | Meaning |
|---|---|---|
| `shared` | `base` | Default visual content under `agent/visual/` outside `artifacts/`. |
| `marketing` | `web` | Override layer under `agent/visual/artifacts/web/`. |
| `product` | `product` | Override layer under `agent/visual/artifacts/product/`. |

Resolution: when a tool is invoked with `context: web` (or `product`), the resolver merges the matching override directory over `base`. Files present in the override win; files missing fall through.

`context: base` returns only base content.

Verbal tools do not accept a `context` argument. There is one canonical positioning, audience, messaging, differentiation, concepts, and voice per brand.

---

## File schemas

All schemas below are **illustrative**. See the Tolerance Principle.

### `agent/verbal/audience.yaml`

Recommended shape:

```yaml
personas:
  - id: founder-marketer
    name: "Solo founder doing marketing"
    role: Founder / GTM lead at a 1–20 person startup
    goals:
      - Ship marketing pages without hiring a designer
    pain_points:
      - Reinventing layouts for every page
    channels: [twitter, linkedin, producthunt]
    voice_notes: "Speaks plainly, hates jargon, skims first"
```

`get_audience` parses with `yaml-parser.ts` and returns the parsed object as-is.

### `agent/verbal/{positioning,messaging,differentiation,concepts,voice}.md`

Plain markdown with optional YAML frontmatter for metadata (e.g., `last_reviewed`, `owner`). Parsed by `markdown-parser.ts`. Returned as `{ frontmatter, body }`.

### `agent/visual/colors_and_type.css`

CSS custom properties for color + typography in a single file. Replaces today's separate `colors.css` and `typography.css`.

```css
:root {
  --color-primary: #1a1a2e;
  --color-bg: #ffffff;
  --font-display: "Söhne", system-ui, sans-serif;
  --font-body: "Inter", sans-serif;
  --type-display-size: 4rem;
}
```

Parsed by `css-parser.ts`. `get_colors_and_type` returns parsed custom properties; `get_css` returns the file text.

### `agent/visual/components/<name>.md`

Markdown with frontmatter; same convention as today.

```markdown
---
name: button
category: primitive
status: stable
---
# Button
## Anatomy
## Do / Don't
## Code
```

### `agent/visual/tokens/<name>.md` (token specimens)

One specimen per token. Frontmatter is the canonical machine-readable representation; the body is human-facing documentation.

```markdown
---
name: color-primary
value: "#1a1a2e"
type: color
role: "Primary brand colour"
related: [color-primary-hover]
---
# color-primary
...
```

`get_tokens` aggregates frontmatter across all specimens. Tokens whose frontmatter is missing required fields (`name`, `value`, `type`) are skipped with a warning, not an error.

### `agent/visual/motion/motion.json` + `motion.css`

```jsonc
// motion.json
{
  "durations": { "fast": "120ms", "normal": "240ms", "slow": "400ms" },
  "easings": {
    "standard": "cubic-bezier(0.2, 0, 0, 1)",
    "decel":    "cubic-bezier(0, 0, 0.2, 1)"
  },
  "animations": {
    "fade-in":  { "duration": "fast",   "easing": "decel" },
    "slide-up": { "duration": "normal", "easing": "standard" }
  }
}
```

`motion.css` carries the corresponding keyframes and CSS variables. `get_motion` returns both.

### `agent/visual/fonts/`

Font binaries plus an optional `fonts.yaml` manifest:

```yaml
faces:
  - family: "Söhne"
    weight: 400
    style: normal
    file: SohneBuch.otf
```

If absent, `font-parser.ts` infers face/weight from filename heuristics. `get_fonts` returns the merged face list.

### `agent/visual/assets/`

Mixed asset binaries (svg, png, jpg, gif). Optional `assets.yaml`:

```yaml
assets:
  - id: logo-primary
    file: logo-primary.svg
    purpose: "Default logo — light backgrounds"
```

If absent, assets are listed by filename only.

### `agent/visual/artifacts/{web,product}/`

Any subset of the `visual/` subtree. File-level override by name. Example override:

```
artifacts/web/
├── colors_and_type.css      # overrides base
└── components/
    └── button.md            # overrides base button.md
```

---

## Config (`brandkit.config.yaml`, v2)

```yaml
version: 2
brand:
  name: Acme Corp
  root: ./brand_atomic_system
contexts:
  - base
  - web
  - product
ignore:
  - human/
```

`loader.ts` rejects `version: 1` configs at startup with a migration error pointing at this design doc.

---

## MCP tool surface

**Total: 18 tools** (up from 13).

### Kept (same name, internals updated)

- `get_brand_overview` — aggregates new tree; includes the full `magic_trick.md` contents under the `_taste_primer` field (the tolerance principle handles missing/large files gracefully).
- `get_components` — backed by `agent/visual/components/`.
- `get_tokens` — backed by `agent/visual/tokens/` specimens.
- `get_css` — returns both files as a structured `{ colors_and_type: string, motion: string }`, after context resolution.
- `search_brand` — re-indexed.
- `validate_usage` — re-targeted to new tokens/components.
- `get_context_diff` — diffs `base | web | product`.

### Renamed / consolidated

- `get_colors` + `get_typography` → **`get_colors_and_type`**
- `get_logos` + `get_textures` → **`get_assets`**
- `get_guidelines` → **split** into the verbal tools below (the unified guidelines bucket is removed)

### New

- `get_positioning`
- `get_audience` (YAML-aware)
- `get_messaging`
- `get_differentiation`
- `get_concepts`
- `get_voice`
- `get_motion`
- `get_magic_trick`
- `get_fonts`

### Magic-trick taste injection

The following tools append a `_taste_primer` field containing the verbatim contents of `magic_trick.md` to every response:

- `get_brand_overview`
- `get_positioning`
- `get_audience`
- `get_messaging`
- `get_differentiation`
- `get_concepts`
- `get_voice`

Visual atom tools (`get_colors_and_type`, `get_tokens`, `get_components`, `get_assets`, `get_fonts`, `get_motion`, `get_css`) do not inject the primer.

`get_magic_trick` returns the file content directly without further wrapping.

### Write protection

No write tools exist in v2. The convention "`magic_trick.md` must never be written by AI" is documented in:

- `CLAUDE.md`
- The tool description for `get_magic_trick`
- `README.md`

A runtime guard is **not** added in v2 (since there are no write tools to guard). If write capabilities are added in a future version, that work must include an explicit path allowlist that rejects `magic_trick.md`.

---

## Code changes

### `src/types/`

- `design-system.ts` — replace `BrandContext = 'shared' | 'marketing' | 'product'` with `'base' | 'web' | 'product'`. Add types: `Positioning`, `Audience`, `Messaging`, `Differentiation`, `Concepts`, `Voice`, `MotionSystem`, `MagicTrick`, `Assets`, `Fonts`. Keep `Component`, `Token`.
- `config.ts` — add `version: 2` literal; reshape `BrandConfig` to point at the `agent/` root and the new contexts.

### `src/config/`

- `defaults.ts` — defaults for v2 (`contexts: [base, web, product]`, `ignore: [human/]`).
- `loader.ts` — version check; v1 configs throw a `BrandkitV1ConfigError` with a link to this spec.

### `src/scanner/`

- `directory-scanner.ts` — rewrite to walk `agent/verbal/`, `agent/visual/`, and `agent/visual/artifacts/{web,product}/`. Skip `human/`. Build a flat index keyed by `(category, context, name)`.

### `src/parsers/`

- Add `yaml-parser.ts` — generic, tolerant YAML loader.
- Add `motion-parser.ts` — reads `motion.json` + `motion.css` together.
- Keep `css-parser.ts`, `markdown-parser.ts`, `font-parser.ts`, `image-parser.ts`.
- Keep `pdf-parser.ts` for future use; default scanner does not invoke it.

### `src/context-resolver.ts`

Replace `marketing | product | shared` merge with `web | product | base`. Same fall-through rule (requested context wins; missing files fall through to base).

### `src/tools/`

**Delete:** `get_colors.ts`, `get_typography.ts`, `get_textures.ts`, `get_logos.ts`, `get_guidelines.ts`.

**Add:** `get_colors_and_type.ts`, `get_assets.ts`, `get_fonts.ts`, `get_positioning.ts`, `get_audience.ts`, `get_messaging.ts`, `get_differentiation.ts`, `get_concepts.ts`, `get_voice.ts`, `get_motion.ts`, `get_magic_trick.ts`.

**Update:** `get_brand_overview.ts`, `get_components.ts`, `get_tokens.ts`, `get_css.ts`, `search_brand.ts`, `validate_usage.ts`, `get_context_diff.ts`.

**Taste injection:** add a small shared helper (e.g. `src/tools/_taste-primer.ts`) that reads `magic_trick.md` once and appends `_taste_primer` to creative/verbal tool responses.

### `src/index.ts`

Update tool registration to match the new surface.

### `src/resources/`

New MCP resource URIs:

- `brand://magic_trick`
- `brand://verbal/positioning`
- `brand://verbal/audience`
- `brand://verbal/messaging`
- `brand://verbal/differentiation`
- `brand://verbal/concepts`
- `brand://verbal/voice`
- `brand://visual/colors_and_type`
- `brand://visual/components`
- `brand://visual/tokens`
- `brand://visual/motion`
- `brand://visual/fonts`
- `brand://visual/assets`
- `brand://overview`

### `src/prompts/`

Audit and update any prompt that references the v1 `marketing/product/shared` vocabulary.

### `src/tests/`

Rewrite fixtures and integration tests against the new tree.

### `__test_fixtures__/`

Replace existing fixtures with one of each new file type: `magic_trick.md`, `positioning.md`, `audience.yaml`, a token specimen, a component, `motion.json` + `motion.css`, and a `colors_and_type.css`.

### `examples/acme-corp/`

Rewrite entirely. Replace the existing `examples/acme-corp/brand/` directory with `examples/acme-corp/brand_atomic_system/` to match the canonical naming in this spec. All file types populated with plausible example content. The `brandkit.config.yaml` `brand.root` field points at the new directory name.

### `templates/starter/`

Same shape as the example but with minimal placeholder content.

### `README.md` and `CLAUDE.md`

- Repository Structure section: rewrite.
- Key Concepts table: replace context vocabulary; add Atomic System, Verbal, Visual, Artifact, Magic Trick, Taste Primer.
- Tool list: rewrite.

### `RELEASING.md`

Document as breaking 2.0.0. No compatibility shim. Note follow-up: `brandkit migrate` CLI is not in scope.

---

## Migration

- No automated migration in v2.0.0.
- v1 configs raise `BrandkitV1ConfigError` at startup with a link to this design doc.
- Manual migration steps for users will be documented in `README.md` under a "Migrating from v1" section: a checklist mapping each old path to its new home.
- Follow-up: optional `brandkit migrate` CLI to auto-convert v1 trees into v2 trees. Tracked as a separate spec.

---

## Open follow-ups (out of scope for this spec)

- `brandkit migrate` CLI.
- Write tools for any category.
- `get_human_pdfs` or another surface over `human/`.
- A taste-primer cache / invalidation strategy if `magic_trick.md` becomes large or frequently edited. v2 reads it on every relevant call.

---

## Acceptance criteria

This spec is implemented when:

1. `examples/acme-corp/` and `templates/starter/` use the new canonical layout end-to-end.
2. All 18 MCP tools listed above are registered, callable, and return shape-correct results against the example brand.
3. The 7 designated creative/verbal tools include a `_taste_primer` field in every response when `magic_trick.md` exists.
4. `directory-scanner.ts` ignores `human/` by default.
5. A v1 `brandkit.config.yaml` produces `BrandkitV1ConfigError` at startup.
6. `README.md` and `CLAUDE.md` describe the new structure and the full tool list.
7. Tests pass against the new fixtures.
