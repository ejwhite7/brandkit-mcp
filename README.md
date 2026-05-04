# BrandKit MCP

> Give every AI tool access to your company's complete design system via the Model Context Protocol.

[![npm version](https://img.shields.io/npm/v/brandkit-mcp)](https://www.npmjs.com/package/brandkit-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)
[![ejwhite7/brandkit-mcp MCP server](https://glama.ai/mcp/servers/ejwhite7/brandkit-mcp/badges/score.svg)](https://glama.ai/mcp/servers/ejwhite7/brandkit-mcp)

BrandKit MCP is an open-source MCP server that makes your design system natively accessible to Claude, Cursor, and any MCP-compatible AI tool. Drop your brand files in, connect once, and every AI session has access to your exact colors, typography, components, guidelines, and more.

## Features

- **Zero-config ingestion** -- drop in CSS files, markdown docs, PDFs, SVGs, and fonts. No YAML token files to write.
- **Context-aware** -- separate marketing site and product app design systems in one project, with shared defaults.
- **Full MCP capability surface** -- 12 tools, 16+ resources (under the `brandkit://` URI scheme), and 4 reusable prompts (`design-with-brand`, `audit-brand-compliance`, `generate-tailwind-theme`, `explain-brand-decision`).
- **Three transports** -- stdio (Claude Desktop), SSE (legacy HTTP), and Streamable HTTP (current MCP spec).
- **5 token output formats** -- CSS custom properties, SCSS variables, Tailwind config, W3C Design Tokens, and flat JSON.
- **Local preview server** -- visual design system browser at localhost:3000.
- **Multiple deployment options** -- local stdio, SSE over HTTP, Docker, Vercel, Cloudflare Workers.
- **Full-text search** across your entire design system.
- **Hot reload** -- file changes automatically re-index in under 1 second.
- **Project doc injection** -- auto-generates CLAUDE.md, AGENTS.md, SKILLS.md, and DESIGN.md for your repository.

## Quick Start (30 seconds)

```bash
# 1. Clone and install
git clone https://github.com/ejwhite7/brandkit-mcp
cd brandkit-mcp
npm install
npm run build

# 2. Initialize your brand directory
node dist/cli/index.js init --name "YourBrand"

# Or install globally with npm link
npm link
brandkit-mcp init --name "YourBrand"

# 3. Add your design files to the brand/ directory
#    Drop CSS files, markdown docs, logos, fonts, PDFs...

# 4. Start the MCP server
node dist/cli/index.js serve

# 5. Or start the preview server to browse visually
node dist/cli/index.js preview --open
```

> **Note:** Once the package is published to npm, `npx brandkit-mcp@latest init` will work directly without cloning.

## Claude Desktop Setup

Add BrandKit MCP to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### stdio Transport (recommended)

```json
{
  "mcpServers": {
    "brandkit": {
      "command": "node",
      "args": ["/path/to/brandkit-mcp/dist/cli/index.js", "serve"],
      "env": {}
    }
  }
}
```

### SSE Transport (for HTTP-based clients)

```json
{
  "mcpServers": {
    "brandkit": {
      "transport": "sse",
      "url": "http://localhost:3001/sse"
    }
  }
}
```

Start the SSE server first:

```bash
node dist/cli/index.js serve --transport sse --port 3001
```

## Supported File Types

| File Type | Extensions | What BrandKit MCP Extracts |
|-----------|-----------|---------------------------|
| CSS | `.css` | Color tokens, typography tokens, custom properties, media queries |
| Markdown | `.md` | Component docs, brand guidelines, voice & tone, color palettes |
| PDF | `.pdf` | Brand guidelines, usage rules, text content |
| SVG | `.svg` | Logo variants, icons, textures/patterns |
| Images | `.png`, `.jpg`, `.webp` | Logo variants with dimensions, textures/patterns |
| Fonts | `.woff2`, `.woff`, `.ttf`, `.otf` | Font family, weight, style metadata |

## Design System Directory Structure

BrandKit MCP scans a `brand/` directory with three context levels:

```
brand/
  shared/             # Tokens and assets shared across all contexts
    colors/
      colors.css          # CSS custom properties for color tokens
    typography/
      typography.css      # Font families, sizes, weights, line heights
    logos/
      logo-primary.svg    # Primary logo
      logo-mark.svg       # Logo mark / icon
      logo-wordmark.svg   # Text-only logo
      usage-guidelines.md # Logo usage rules
    voice/
      brand-voice.md      # Brand personality, tone, writing principles
    guidelines/
      accessibility.md    # WCAG compliance, contrast ratios
      spacing.md          # Spacing system documentation

  marketing/           # Marketing-site-specific overrides and assets
    colors/
      marketing-overrides.css   # Warmer accent tones for landing pages
    components/
      hero-section.md           # Hero section specs and examples
      feature-card.md           # Feature card component docs
    guidelines/
      marketing-writing.md      # Headline and CTA guidelines

  product/             # Product-app-specific overrides and assets
    colors/
      product-overrides.css     # Subdued accent tones for the app UI
    components/
      data-table.md             # Data table component specs
      sidebar-nav.md            # Navigation component docs
    guidelines/
      ui-patterns.md            # Loading states, empty states, forms
```

**Convention:** Subdirectory names (`colors/`, `typography/`, `logos/`, `components/`, `guidelines/`, `voice/`, `textures/`) determine how files are parsed. Place files in the matching directory for automatic classification.

## MCP Tools Reference

BrandKit MCP exposes 12 tools to AI assistants:

| # | Tool | Description | Key Parameters |
|---|------|-------------|----------------|
| 1 | `get_brand_overview` | High-level summary of the entire design system | *(none)* |
| 2 | `get_colors` | All color tokens with hex values, roles, and usage | `context`, `role` |
| 3 | `get_typography` | Font families, sizes, weights, and line heights | `context` |
| 4 | `get_logos` | Logo variants with metadata and usage guidelines | `context`, `variant`, `include_base64` |
| 5 | `get_components` | Component documentation, specs, and code examples | `context`, `category`, `name` |
| 6 | `get_guidelines` | Brand voice, accessibility, and design guidelines | `context`, `section` |
| 7 | `get_tokens` | Design tokens in any of 5 output formats | `context`, `format`, `category` |
| 8 | `get_textures` | Background textures and patterns | `context` |
| 9 | `get_css` | Raw parsed CSS with all custom properties | `context` |
| 10 | `search_brand` | Full-text search across the entire design system | `query`, `context`, `type`, `limit` |
| 11 | `get_context_diff` | Differences between marketing and product contexts | `aspect` |
| 12 | `validate_usage` | Validate color/typography usage against the system | `colors`, `fonts`, `context` |

### Tool Usage Examples

**Get all colors for the marketing context:**

```json
{
  "tool": "get_colors",
  "arguments": {
    "context": "marketing",
    "role": "accent"
  }
}
```

Response:

```
## Colors (marketing context, role: accent)

| Token | Name | Hex | Role | Usage |
|-------|------|-----|------|-------|
| --color-accent | Accent | #ff6b6b | accent | Primary accent for CTAs |
| --color-accent-light | Accent Light | #ff8787 | accent | Hover states |
| --color-accent-dark | Accent Dark | #e63946 | accent | Active/pressed states |
```

**Search across the design system:**

```json
{
  "tool": "search_brand",
  "arguments": {
    "query": "button hover state",
    "context": "all",
    "limit": 5
  }
}
```

**Export tokens as Tailwind config:**

```json
{
  "tool": "get_tokens",
  "arguments": {
    "format": "tailwind",
    "context": "product",
    "category": "colors"
  }
}
```

**Compare marketing vs product design systems:**

```json
{
  "tool": "get_context_diff",
  "arguments": {
    "aspect": "colors"
  }
}
```

**Validate that your code uses approved colors:**

```json
{
  "tool": "validate_usage",
  "arguments": {
    "colors": ["#1a1a2e", "#ff0000", "#e94560"],
    "context": "marketing"
  }
}
```

## Context System: Marketing vs Product

BrandKit MCP supports three directory-level contexts that model how real design systems work:

| Context | Directory | Purpose |
|---------|-----------|---------|
| **shared** | `brand/shared/` | Tokens and guidelines common to both contexts. Acts as the default layer. |
| **marketing** | `brand/marketing/` | Overrides and additions for the public-facing marketing website. |
| **product** | `brand/product/` | Overrides and additions for the SaaS product application. |

### How Context Resolution Works

1. **Shared is the base.** Every token and guideline in `shared/` is available to both contexts.
2. **Context-specific values override shared values.** If `shared/colors/colors.css` defines `--color-accent: #e94560` and `marketing/colors/overrides.css` defines `--color-accent: #ff6b6b`, then marketing context returns `#ff6b6b`.
3. **Context-specific additions are kept separate.** A component defined only in `product/components/` won't appear in marketing results.
4. **The "all" view is the union.** Querying with `context: "all"` returns every asset from all three directories.

### When to Use Each Context

- **Use `context: "marketing"`** when generating landing pages, marketing emails, blog posts, or ad copy.
- **Use `context: "product"`** when building app features, dashboards, settings pages, or in-app messaging.
- **Use `context: "all"`** when you need a complete inventory or are searching broadly.
- **Omit `context`** (defaults to "all") for general exploration.

## Token Output Formats

The `get_tokens` tool supports 5 output formats:

### CSS Custom Properties

```css
:root {
  --color-primary: #1a1a2e;
  --color-secondary: #0f3460;
  --color-accent: #e94560;
  --font-family-primary: 'Inter', sans-serif;
  --font-size-base: 1rem;
}
```

### SCSS Variables

```scss
$color-primary: #1a1a2e;
$color-secondary: #0f3460;
$color-accent: #e94560;
$font-family-primary: 'Inter', sans-serif;
$font-size-base: 1rem;
```

### Tailwind Config

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#1a1a2e',
        secondary: '#0f3460',
        accent: '#e94560',
      },
      fontFamily: {
        primary: ["'Inter'", 'sans-serif'],
      },
      fontSize: {
        base: '1rem',
      },
    },
  },
};
```

### W3C Design Tokens

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "primary": { "$type": "color", "$value": "#1a1a2e" },
    "secondary": { "$type": "color", "$value": "#0f3460" },
    "accent": { "$type": "color", "$value": "#e94560" }
  }
}
```

### JSON Tokens

```json
{
  "colors": {
    "--color-primary": { "value": "#1a1a2e", "name": "Primary" },
    "--color-secondary": { "value": "#0f3460", "name": "Secondary" },
    "--color-accent": { "value": "#e94560", "name": "Accent" }
  }
}
```

## Project Documentation Files

BrandKit MCP can auto-generate project documentation files that give AI tools persistent context about your design system. Run:

```bash
node dist/cli/index.js docs
```

This generates four files:

| File | Purpose |
|------|---------|
| **CLAUDE.md** | Project overview with tool usage instructions for Claude |
| **AGENTS.md** | Multi-agent workflow context with design system summary |
| **SKILLS.md** | Reusable skill definitions for design token lookup |
| **DESIGN.md** | Complete design system reference document |

### Delimiter System

Each generated file uses a clearly marked section that BrandKit MCP owns:

```markdown
<!-- BRANDKIT:START -->
(auto-generated content here)
<!-- BRANDKIT:END -->
```

Content outside these delimiters is preserved when you regenerate. This lets you add custom notes above or below the auto-generated section.

## Preview Server

The preview server provides a visual browser for your design system at `http://localhost:3000`.

```bash
node dist/cli/index.js preview --port 3000 --watch --open
```

### Pages

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Overview with asset counts and quick links |
| Colors | `/colors` | Color palette with swatches, hex values, and roles |
| Typography | `/typography` | Font specimens with all sizes and weights |
| Logos | `/logos` | Logo variants grid with download metadata |
| Components | `/components` | Component documentation with code examples |
| Guidelines | `/guidelines` | Brand voice, accessibility, and design guidelines |
| Textures | `/textures` | Background textures and patterns gallery |
| Tokens | `/tokens` | Token export in all 5 formats with copy-to-clipboard |
| CSS | `/css` | Raw parsed CSS custom properties |
| Search | `/search` | Full-text search across the design system |

The `--watch` flag enables hot reload: edit a brand file and the preview updates automatically.

## Deployment

### Local (stdio) -- Recommended for Claude Desktop

The simplest setup. The MCP server communicates over stdin/stdout:

```bash
node dist/cli/index.js serve
```

Configure Claude Desktop to launch the server automatically (see [Claude Desktop Setup](#claude-desktop-setup)).

### Local (SSE) -- For HTTP-based MCP Clients

Starts an HTTP server with Server-Sent Events transport:

```bash
node dist/cli/index.js serve --transport sse --port 3001 --watch
```

Connect any MCP client to `http://localhost:3001/sse`.

### Docker

Build and run with Docker:

```bash
docker build -t brandkit-mcp .
docker run -p 3001:3001 -v $(pwd)/brand:/app/brand:ro brandkit-mcp
```

Or use Docker Compose:

```bash
docker-compose up
```

This starts both the MCP server (port 3001) and the preview server (port 3000).

### Vercel

Deploy as a Vercel serverless function:

1. Install the Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel --prod`
3. Connect to the SSE endpoint: `https://your-project.vercel.app/api/sse`

The `vercel.json` configuration routes `/api/sse` and `/api/messages` to the adapter.

### Cloudflare Workers

Deploy to Cloudflare Workers:

1. Install Wrangler: `npm i -g wrangler`
2. Configure `wrangler.toml` with your account details
3. Bundle your design system data at build time (Workers don't have filesystem access)
4. Deploy: `wrangler deploy`

### Standalone HTTP Server

Run a plain Node.js HTTP server without Express:

```bash
node dist/adapters/standalone.js
```

Or programmatically:

```typescript
import { startStandaloneServer } from 'brandkit-mcp/adapters/standalone';
await startStandaloneServer(3001, './brandkit.config.yaml');
```

## CLI Reference

```
brandkit-mcp <command> [options]

Commands:
  init [directory]      Initialize a new brand directory with starter files
  validate [config]     Validate configuration and scan for issues
  serve                 Start the MCP server
  preview               Start the local preview server
  docs                  Generate project documentation files

Global Options:
  --version             Show version number
  --help                Show help
```

### `init [directory]`

Create a new brand directory with starter configuration and example files.

```bash
brandkit-mcp init .
brandkit-mcp init ./my-brand --name "Acme Corp"
brandkit-mcp init . --force    # Overwrite existing files
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Brand name for the config file |
| `--force` | Overwrite existing files without prompting |

### `validate [config-path]`

Validate the design system configuration and report any issues.

```bash
brandkit-mcp validate
brandkit-mcp validate ./brandkit.config.yaml
```

Checks:
- Config file exists and is valid YAML
- All referenced directories exist
- CSS files parse without errors
- Markdown frontmatter is well-formed
- No orphaned files outside recognized directories

### `serve`

Start the MCP server for AI tool connections.

```bash
brandkit-mcp serve
brandkit-mcp serve --transport sse --port 3001
brandkit-mcp serve --config ./custom-config.yaml --watch
```

| Option | Description | Default |
|--------|-------------|---------|
| `--transport <type>` | Transport: `stdio` or `sse` | `stdio` |
| `--port <number>` | Port for SSE transport | `3001` |
| `--config <path>` | Path to config file | auto-detect |
| `--watch` | Enable hot reload | `false` |

### `preview`

Launch the visual preview server.

```bash
brandkit-mcp preview
brandkit-mcp preview --port 8080 --watch --open
```

| Option | Description | Default |
|--------|-------------|---------|
| `--port <number>` | Preview server port | `3000` |
| `--config <path>` | Path to config file | auto-detect |
| `--watch` | Enable hot reload | `false` |
| `--open` | Open browser automatically | `false` |

### `docs`

Generate project documentation files for AI tools.

```bash
brandkit-mcp docs
brandkit-mcp docs --output ./docs --config ./brandkit.config.yaml
```

| Option | Description | Default |
|--------|-------------|---------|
| `--config <path>` | Path to config file | auto-detect |
| `--output <dir>` | Output directory for generated files | `.` |

Generates: `CLAUDE.md`, `AGENTS.md`, `SKILLS.md`, `DESIGN.md`

## Configuration Reference

The `brandkit.config.yaml` file controls all aspects of BrandKit MCP:

```yaml
# Required: your brand name
name: "Acme Corp"

# Optional: description shown in MCP server metadata
description: "Design system for Acme Corporation"

# Semantic version of your design system
version: "2.0.0"

# Context configuration
contexts:
  marketing:
    enabled: true
    label: "Marketing Website"
    description: "Public-facing marketing site (acme.com)"
  product:
    enabled: true
    label: "Product App"
    description: "SaaS application (app.acme.com)"

# Directory path overrides (relative to config file)
paths:
  brand: "./brand"
  shared: "./brand/shared"
  marketing: "./brand/marketing"
  product: "./brand/product"

# Preview server settings
preview:
  port: 3000
  host: localhost

# MCP server settings
server:
  transport: stdio     # "stdio" or "sse"
  port: 3001           # Used when transport is "sse"
  host: localhost
```

The only required field is `name`. Everything else has sensible defaults.

## Contributing

Contributions are welcome! Here's how to get started:

### Development Setup

```bash
git clone https://github.com/anthropics/brandkit-mcp.git
cd brandkit-mcp
npm install
npm run build
npm run dev    # Watch mode
```

### How to Add a New Parser

1. Create `src/parsers/your-parser.ts`
2. Export a parse function that accepts a file path and context
3. Return typed data matching the interfaces in `src/types/design-system.ts`
4. Add the file type to `classifyFileType()` in `src/scanner/directory-scanner.ts`
5. Add a processing case in `processFile()` in `src/indexer/index.ts`
6. Write tests in `src/tests/parsers.test.ts`

### How to Add a New MCP Tool

1. Create `src/tools/your-tool.ts`
2. Export `TOOL_NAME`, `TOOL_DESCRIPTION`, `INPUT_SCHEMA`, and `handler()`
3. Add the argument interface to `src/types/mcp.ts`
4. Import and register the tool in `src/tools/index.ts`
5. Add the tool to the switch statement in the tools/call handler
6. Update the README tools reference table

### Code Style

- TypeScript strict mode enabled
- ESM imports with `.js` extensions
- No `any` types -- use proper interfaces
- All public functions have JSDoc comments
- Tests use Vitest

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npx vitest run src/tests/parsers.test.ts  # Single file
```

## Examples

### Acme Corp

A complete example design system is included at `examples/acme-corp/`. It demonstrates:

- Shared color palette with neutral and semantic colors
- Typography system with three font families
- Logo usage guidelines
- Brand voice and tone documentation
- Accessibility standards
- Marketing-specific color overrides and components (Hero Section, Feature Card)
- Product-specific color overrides and components (Data Table, Sidebar Navigation)
- Context-specific writing and UI pattern guidelines

To try it:

```bash
cd examples/acme-corp
node dist/cli/index.js preview --open
```

### Starter Template

A minimal starter template is available at `templates/starter/`. Use it as a starting point:

```bash
cp -r templates/starter/* .
node dist/cli/index.js validate
```

## License

MIT -- see [LICENSE](LICENSE) for details.

---

Built with the [Model Context Protocol](https://modelcontextprotocol.io) by [Anthropic](https://anthropic.com).
