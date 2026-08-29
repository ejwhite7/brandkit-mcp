# CLAUDE.md -- BrandKit MCP

> **What is this file?** This is the project intelligence document for
> BrandKit MCP. It tells Claude (and any other LLM-based coding agent)
> everything it needs to know to work effectively in this codebase.

---

## Project Overview

**BrandKit MCP** is an open-source TypeScript server that exposes a
company's complete **brand atomic system** -- verbal identity and visual
identity -- to Claude and other AI tools via the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

The v2 atom-typed layout is the canonical model. The brand root contains
two trees: `agent/verbal/` (language identity) and `agent/visual/`
(visual identity), plus a human-authored taste primer at `magic_trick.md`
and a `human/` directory for PDF materials the MCP intentionally ignores.

The goal: when an LLM helps build a website, app, or marketing asset, it
has instant structured access to the exact brand language and visual rules
it needs -- including the brand's instincts, not just its specs.

### Key Concepts

| Term | Meaning |
|------|---------|
| **Atomic system** | The full v2 layout under `<brand-root>/`: readme, magic_trick, human/, agent/. |
| **Verbal** | Brand language: positioning, audience, messaging, differentiation, concepts, voice. Single source of truth -- no context overrides. |
| **Visual** | Brand visual atoms: colors_and_type, fonts, assets, components, tokens, motion. Context overrides live under `artifacts/`. |
| **Context** | `base`, `web`, or `product`. Visual content can be overridden per context; verbal cannot. |
| **Artifact** | A context-specific visual override layer (`agent/visual/artifacts/{web,product}/`). |
| **Magic trick** | Human-authored taste primer at `<brand-root>/magic_trick.md`. Read by creative/verbal tools and injected into their responses. Never written by AI. |
| **Taste primer** | The `_taste_primer` field added by creative/verbal tools, carrying `magic_trick.md` verbatim. |
| **Token specimen** | One markdown file per token in `agent/visual/tokens/`. Frontmatter carries the canonical value. |
| **MCP Tool** | A function exposed over the Model Context Protocol that an LLM can call. |
| **MCP Resource** | A static or dynamic data endpoint exposed as a `brand://` URI. |

---

## Repository Structure

### Brand atomic system layout

```
<brand-root>/
├── readme.md
├── magic_trick.md               # human-authored taste primer
├── brandkit.config.yaml         # version: 2
├── human/                       # PDFs and human-only material (MCP ignores)
│   └── *.pdf
└── agent/
    ├── verbal/
    │   ├── positioning.md
    │   ├── audience.yaml
    │   ├── messaging.md
    │   ├── differentiation.md
    │   ├── concepts.md
    │   └── voice.md
    └── visual/
        ├── colors_and_type.css
        ├── fonts/
        ├── assets/
        ├── components/
        ├── tokens/
        ├── motion/
        │   ├── motion.json
        │   └── motion.css
        └── artifacts/
            ├── web/             # override layer
            └── product/         # override layer
```

### Source code layout

```
src/
├── adapters/          # Cloudflare Workers + Vercel + standalone HTTP wrappers
├── cli/               # init, serve, validate, docs commands
├── config/            # zod schema loader (v2)
├── context-resolver.ts # base/web/product merge
├── formatters/        # token output formatters (css, scss, tailwind, w3c)
├── indexer/           # buildIndex + hot-reload
├── parsers/           # css, font, markdown, motion, verbal, yaml
├── preview/           # local preview HTTP server
├── prompts/           # MCP prompt templates
├── resources/         # MCP resource handlers (brand:// URIs)
├── scanner/           # directory scanner (walks brand atomic system)
├── tests/             # vitest
├── tools/             # 19 MCP tools
└── types/             # design-system + config zod schemas
```

---

## Tool Surface (19 tools)

| Tool | Description |
|------|-------------|
| `get_brand_overview` | High-level overview + taste primer |
| `get_magic_trick` | Verbatim magic_trick.md |
| `get_positioning` | Positioning document |
| `get_audience` | Audience YAML, parsed |
| `get_messaging` | Messaging document |
| `get_differentiation` | Differentiation document |
| `get_concepts` | Creative concepts/directions |
| `get_voice` | Voice document |
| `get_colors_and_type` | Colors + typography custom properties |
| `get_assets` | Logos + brand assets |
| `get_fonts` | Font faces |
| `get_components` | UI primitives |
| `get_tokens` | Token specimens |
| `get_motion` | Motion system (json + css) |
| `get_css` | colors_and_type.css + motion.css text |
| `search_brand` | Full-text search |
| `validate_usage` | Validate brand compliance |
| `get_context_diff` | Diff base vs web vs product |
| `sync_brand_docs` | Generate/update DESIGN.md + PRODUCT.md from the brand + a 4-answer brief (write tool) |

Seven creative/verbal tools (`get_brand_overview`, `get_positioning`, `get_audience`, `get_messaging`, `get_differentiation`, `get_concepts`, `get_voice`) inject a `_taste_primer` field carrying `magic_trick.md` verbatim. `get_magic_trick` returns the primer directly without wrapping.

---

## Conventions

**Never write to `magic_trick.md`.** This file is human-authored. The MCP exposes exactly one write tool today (`sync_brand_docs`), which writes only `brandkit.config.yaml`, `DESIGN.md`, and `PRODUCT.md`. `magic_trick.md` MUST remain on the write denylist.

**Tolerance principle.** Parsers degrade gracefully -- never throw on bad input. Tools always include a `_warnings: string[]` field.

**Schemas are illustrative.** Frontmatter fields, YAML shapes, and JSON shapes documented in `docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md` are recommended but not enforced. Token specimens missing required frontmatter are skipped with a warning, not an error.

**Context vocabulary.** v2 uses `base | web | product`. The v1 vocabulary (`shared | marketing | product`) is gone. A `brandkit.config.yaml` without `version: 2` throws `BrandkitV1ConfigError` at startup.

**`config.contexts` is reserved.** The field is validated and defaulted but
not yet honored: the resolver always materializes `base`, `web`, and
`product`. Setting `contexts: [base]` does not disable the override layers.

**`human/` is ignored.** The scanner skips the `human/` directory entirely. Drop PDFs, print specs, or any material not intended for AI consumption there.

**Brief drives DESIGN.md / PRODUCT.md.** An optional `brief:` block in
`brandkit.config.yaml` (`audience`, `voice_words`, `visual_references`,
`anti_references`) is combined with the brand atomic system to generate two
write-only reference files at the project root: `PRODUCT.md` (who & why, from
the verbal atoms) and `DESIGN.md` (how it looks, from the visual atoms). They
guide coding agents that are NOT using the MCP. The MCP never reads them back
as input. They are regenerated on server startup (when the brief is complete)
and by the `sync_brand_docs` tool, which asks for any missing answers first.

---

## Build + Dev

```bash
npm test          # run all tests (vitest)
npm run build     # compile via tsup
npm run lint      # eslint src --ext .ts
npm run typecheck # tsc --noEmit
npm run dev       # watch mode
```

Tests live in `src/tests/`. Run a single file:

```bash
npx vitest run src/tests/parsers.test.ts
```
