# CLAUDE.md -- BrandKit MCP

> **What is this file?** This is the project intelligence document for
> BrandKit MCP. It tells Claude (and any other LLM-based coding agent)
> everything it needs to know to work effectively in this codebase.

---

## Project Overview

**BrandKit MCP** is an open-source TypeScript server that exposes a
company's complete design system -- colors, typography, logos, components,
textures, guidelines, and CSS tokens -- to Claude and other AI tools via
the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

The goal: when an LLM helps build a website, app, or marketing page, it
should have instant, structured access to the exact brand assets and rules
it needs. No more guessing hex codes or misapplying logo variants.

### Key Concepts

| Term | Meaning |
|------|---------|
| **Design System** | The complete collection of colors, fonts, logos, components, guidelines, and tokens that define a brand's visual identity. |
| **Context** | BrandKit differentiates between `marketing` (public website) and `product` (app UI) contexts. Each can have its own overrides layered on top of a `shared` base. |
| **Token** | A named design value (e.g. `--color-primary: #1a1a2e`). Tokens are the atomic building blocks of a design system. |
| **MCP Tool** | A function exposed over the Model Context Protocol that an LLM can call to retrieve design-system data. |
| **MCP Resource** | A static or dynamic data endpoint exposed as a URI that MCP clients can read. |

---

## Repository Structure


