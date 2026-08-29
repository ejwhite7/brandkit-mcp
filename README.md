# BrandKit MCP

> Give every AI tool access to your company's complete brand atomic system via the Model Context Protocol.

[![npm version](https://img.shields.io/npm/v/brandkit-mcp)](https://www.npmjs.com/package/brandkit-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)
[![ejwhite7/brandkit-mcp MCP server](https://glama.ai/mcp/servers/ejwhite7/brandkit-mcp/badges/score.svg)](https://glama.ai/mcp/servers/ejwhite7/brandkit-mcp)

BrandKit MCP v2 is an open-source MCP server that exposes a company's complete **brand atomic system** -- verbal identity (positioning, audience, messaging, differentiation, concepts, voice) and visual identity (colors, typography, components, tokens, motion, assets) -- to Claude and other AI tools via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). It ships 18 read-only tools, one local write tool, and 14 resources. When an LLM helps build a website, app, or marketing asset, it has instant structured access to the exact brand language and visual rules it needs -- including a human-authored taste primer that carries the brand's instincts, not just its specs.

## Quick Start

```bash
# 1. Install
npm install -g brandkit-mcp

# 2. Scaffold a new brand atomic system from the starter template
brandkit-mcp init

# 3. Edit the scaffolded files with your brand content

# 4. Wire into Claude Desktop (or any MCP-compatible client)
#    Add to ~/Library/Application Support/Claude/claude_desktop_config.json:
#    {
#      "mcpServers": {
#        "brandkit": {
#          "command": "brandkit-mcp",
#          "args": ["serve"]
#        }
#      }
#    }
```

## Repository Structure

A brand atomic system lives under a single `<brand-root>/` directory (default: `./brand_atomic_system`):

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

The `human/` directory is intentionally ignored by the MCP server -- put PDFs, print specs, or any other human-only material there. Everything under `agent/` is indexed and served.

## MCP Tools Reference

BrandKit MCP exposes 18 tools to AI assistants:

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

The stdio transport also exposes `sync_brand_docs`, which updates `brandkit.config.yaml`, `DESIGN.md`, and `PRODUCT.md`. Network transports hide and refuse this write-capable tool by default.

### Taste primer

Seven creative/verbal tools (`get_brand_overview`, `get_positioning`, `get_audience`, `get_messaging`, `get_differentiation`, `get_concepts`, `get_voice`) inject a `_taste_primer` field carrying `magic_trick.md` verbatim. `get_magic_trick` returns the primer directly without wrapping.

## MCP Resources

BrandKit MCP exposes 14 `brand://` URIs as MCP resources:

| URI | Description |
|-----|-------------|
| `brand://overview` | Brand overview |
| `brand://magic_trick` | Taste primer |
| `brand://verbal/positioning` | Positioning document |
| `brand://verbal/audience` | Audience YAML |
| `brand://verbal/messaging` | Messaging document |
| `brand://verbal/differentiation` | Differentiation document |
| `brand://verbal/concepts` | Creative concepts |
| `brand://verbal/voice` | Voice document |
| `brand://visual/colors_and_type` | Colors + typography CSS |
| `brand://visual/assets` | Asset index |
| `brand://visual/fonts` | Font face index |
| `brand://visual/components` | Component index |
| `brand://visual/tokens` | Token specimens |
| `brand://visual/motion` | Motion system |

## Configuration

The `brandkit.config.yaml` file at your project root controls BrandKit MCP:

```yaml
version: 2
brand:
  name: Acme Corp
  description: Plumbing for builders.
  root: ./brand_atomic_system
contexts: [base, web, product]
ignore:
  - human/
```

Ignore entries are paths relative to `brand.root`. They match the named path and its descendants
on directory boundaries, so `human/` does not match `humanity/`.

`version: 2` is required. A config file missing this field or declaring `version: 1` causes the server to throw `BrandkitV1ConfigError` at startup.

## Context System

BrandKit v2 supports three contexts:

| Context | Purpose |
|---------|---------|
| `base` | Shared foundation -- fonts, core colors, global tokens |
| `web` | Overrides for the public-facing website (`agent/visual/artifacts/web/`) |
| `product` | Overrides for the SaaS application (`agent/visual/artifacts/product/`) |

Verbal content (`agent/verbal/`) has no context overrides -- it applies globally. Visual content can be overridden per context via the `artifacts/` layer.

## Migrating from v1

**2.0.0 is a breaking release.** The directory layout, context vocabulary, and tool surface have all changed. No automated migration is included -- the path mapping is manual:

| v1 path | v2 path |
|---------|---------|
| `brand/shared/colors/*.css` | `agent/visual/colors_and_type.css` |
| `brand/shared/typography/*.css` | `agent/visual/colors_and_type.css` |
| `brand/shared/logos/*` | `agent/visual/assets/` |
| `brand/shared/components/*.md` | `agent/visual/components/*.md` |
| `brand/shared/voice/brand-voice.md` | `agent/verbal/voice.md` |
| `brand/shared/guidelines/*.md` | `agent/verbal/{positioning,messaging,differentiation,concepts}.md` |
| `brand/marketing/*` | `agent/visual/artifacts/web/*` |
| `brand/product/*` | `agent/visual/artifacts/product/*` |

Your `brandkit.config.yaml` must also be updated to declare `version: 2` and use the new `brand.root` field. v1 configs throw `BrandkitV1ConfigError` at startup -- the server will not start until the config is updated.

## Conventions

**`magic_trick.md` is human-authored.** The MCP reads it, but `sync_brand_docs` never writes to it. The taste primer is the brand's instincts -- it must stay human.

**Token output formats.** The `get_tokens` tool supports CSS custom properties, SCSS variables, Tailwind config, W3C Design Tokens, and flat JSON.

**Brand files stay inside `brand.root`.** Every fixed and discovered brand input is resolved and opened under the configured root. A symlink is accepted when its final target remains inside that root; symlinks and manifest paths that escape the root are ignored with a warning, and their content is never indexed or exposed through tools, resources, or preview pages.

**The config must be a regular, single-link file.** `brandkit.config.yaml` cannot be a symbolic link, hard link, directory, or other non-regular entry. The server binds config persistence to the file loaded at startup; if that path is replaced while the server is running, `sync_brand_docs` refuses to read or overwrite the replacement. Successful config updates use an atomic same-directory replacement and preserve existing permissions.

**Transports.** The server supports stdio (recommended for Claude Desktop), SSE (legacy HTTP), and Streamable HTTP (current MCP spec). Network transports remain unauthenticated when bound to loopback for local development. Before binding SSE or HTTP to any non-loopback host, set `BRANDKIT_AUTH_TOKEN`; clients must send it as `Authorization: Bearer <token>` on every request.

Network transports are read-only by default, including loopback, standalone, and Vercel deployments. To deliberately expose `sync_brand_docs` over SSE or Streamable HTTP, start the CLI with `brandkit-mcp serve --transport http --allow-write-tools` (or set `allowWriteTools: true` in the programmatic `startServer` options). Treat this as privileged mode: authentication is still mandatory for non-loopback binds. Stdio keeps the intended local write workflow without this flag. Adapters without a writable config context never advertise the tool, even if privileged mode is requested.

Every network transport rejects untrusted `Host` and `Origin` headers with HTTP 403. Loopback listeners automatically trust loopback hostnames and origins, including IPv4, IPv6, and ephemeral ports. A concrete non-loopback `server.host` derives trust for that exact hostname. Wildcard bindings (`0.0.0.0` or `::`) fail at startup unless `server.allowedHosts` is explicit:

```yaml
server:
  transport: http
  host: 0.0.0.0
  port: 3001
  allowedHosts:
    - mcp.example.com       # hostname only; Host-header ports are ignored
  allowedOrigins:
    - https://app.example.com
```

`allowedOrigins` entries are exact HTTP(S) origins, including the port when it is non-default. If the list is empty, requests without an `Origin` header remain valid for MCP clients, while a supplied Origin must use a trusted Host hostname. Configure `allowedOrigins` explicitly when a browser application is hosted on a different origin. IPv6 entries in `allowedHosts` use brackets, for example `[2001:db8::10]`.

### Docker Compose

The default Compose service runs the supported Streamable HTTP transport on `http://127.0.0.1:3001/mcp`. It uses the bundled Acme example, so a fresh checkout does not require host-side brand files. Set a bearer token before starting it:

```bash
export BRANDKIT_AUTH_TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
docker compose up --build --wait --wait-timeout 60
npm run test:docker-smoke
```

The token is injected at runtime and is also required by the authenticated health check. Compose refuses to start when it is absent. To use your own brand, mount a regular config file and brand directory, set `BRANDKIT_CONFIG` to the container path of that config, and keep `server.allowedHosts` limited to the hostnames clients actually use. Do not put the token in the image or config file. Compose intentionally exposes only the authenticated MCP service; run the preview CLI separately on a trusted local machine. Existing stdio container integrations can override the image command with `node /app/dist/cli/index.js serve --transport stdio --config <path>` and do not need to publish a port.

### Vercel

The repository includes one stateless Node.js Function at `/api/mcp`. Set
`BRANDKIT_AUTH_TOKEN` in every Vercel environment and send it as a Bearer token.
Vercel's `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are trusted
automatically. For a custom domain, set `BRANDKIT_ALLOWED_HOSTS` to a
comma-separated hostname list, without schemes or paths.

The default deployment explicitly bundles `templates/starter/**` and serves
that data read-only. To deploy another brand, set `BRANDKIT_CONFIG` to its
repository-relative config path and update `functions.api/mcp.js.includeFiles`
in `vercel.json` to include both that config and its complete brand root. Vercel
runtime files are immutable; the function never advertises `sync_brand_docs`.
Each request creates and closes its own MCP server and transport, so requests do
not depend on a warm instance or session affinity.

## CLI Reference

```
brandkit-mcp <command> [options]

Commands:
  init [directory]      Scaffold a brand atomic system from the starter template
  validate [config]     Validate configuration and scan for issues
  serve                 Start the MCP server
  preview               Start the local preview UI for browsing the brand atomic system
  docs                  Generate project documentation files

Global Options:
  --version             Show version number
  --help                Show help
```

`serve` accepts `--transport <stdio|sse|http>`, `--host <host>`, `--port <number>`, `--config <path>`, `--watch`, and the privileged network option `--allow-write-tools`.

## Contributing

Contributions are welcome.

```bash
git clone https://github.com/ejwhite7/brandkit-mcp
cd brandkit-mcp
npm install
npm run build
npm test
```

- TypeScript strict mode
- ESM imports with `.js` extensions
- No `any` types -- use proper interfaces
- Tests use Vitest

## License

MIT -- see [LICENSE](LICENSE) for details.

---

Built with the [Model Context Protocol](https://modelcontextprotocol.io) by [Anthropic](https://anthropic.com).
