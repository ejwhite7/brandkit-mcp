/**
 * @file resources/index.ts
 * @description MCP Resources for BrandKit.
 *
 * Exposes design-system entities as addressable resources under the
 * `brandkit://` URI scheme so MCP clients can browse and read them
 * directly without invoking tools.
 *
 * URI patterns:
 *   brandkit://overview                    -- summary of the whole brand
 *   brandkit://tokens/{format}             -- design tokens (css|scss|tailwind|w3c|json)
 *   brandkit://colors/{context}            -- color palette per context
 *   brandkit://typography/{context}        -- typography per context
 *   brandkit://components/{context}        -- components per context
 *   brandkit://guidelines/{slug}           -- a single guideline document
 *   brandkit://logos                       -- logo system metadata
 *   brandkit://logo/{variantSlug}          -- a single logo variant (binary)
 *   brandkit://css/all                     -- aggregated raw CSS
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { DesignSystemIndex } from '../indexer/types.js';
import type { ResolvedDesignSystem } from '../types/design-system.js';
import { toCSSFormat } from '../formatters/css.js';
import { toSCSSFormat } from '../formatters/scss.js';
import { toTailwindFormat } from '../formatters/tailwind.js';
import { toW3CFormat } from '../formatters/w3c-tokens.js';
import { toJSONFormat } from '../formatters/json-tokens.js';

const SCHEME = 'brandkit://';

interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** Convert a string to a URI-safe slug. */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function pickResolved(index: DesignSystemIndex, ctx: string): ResolvedDesignSystem {
  switch (ctx) {
    case 'marketing': return index.resolved.marketing;
    case 'product': return index.resolved.product;
    case 'shared':
    case 'all':
    default: return index.resolved.all;
  }
}

/** List every static resource the server exposes. */
export function listResources(index: DesignSystemIndex): ResourceDescriptor[] {
  const out: ResourceDescriptor[] = [
    { uri: `${SCHEME}overview`, name: 'Brand Overview', description: 'High-level summary of the brand and asset inventory', mimeType: 'application/json' },
    { uri: `${SCHEME}tokens/css`, name: 'Design Tokens (CSS)', mimeType: 'text/css' },
    { uri: `${SCHEME}tokens/scss`, name: 'Design Tokens (SCSS)', mimeType: 'text/x-scss' },
    { uri: `${SCHEME}tokens/tailwind`, name: 'Design Tokens (Tailwind)', mimeType: 'application/javascript' },
    { uri: `${SCHEME}tokens/w3c`, name: 'Design Tokens (W3C)', mimeType: 'application/json' },
    { uri: `${SCHEME}tokens/json`, name: 'Design Tokens (JSON)', mimeType: 'application/json' },
    { uri: `${SCHEME}colors/all`, name: 'Colors -- all contexts', mimeType: 'application/json' },
    { uri: `${SCHEME}colors/marketing`, name: 'Colors -- marketing', mimeType: 'application/json' },
    { uri: `${SCHEME}colors/product`, name: 'Colors -- product', mimeType: 'application/json' },
    { uri: `${SCHEME}typography/all`, name: 'Typography -- all contexts', mimeType: 'application/json' },
    { uri: `${SCHEME}components/all`, name: 'Components -- all contexts', mimeType: 'application/json' },
    { uri: `${SCHEME}logos`, name: 'Logo System', mimeType: 'application/json' },
    { uri: `${SCHEME}css/all`, name: 'Raw CSS (concatenated)', mimeType: 'text/css' },
  ];

  // One resource per guideline document
  for (const g of index.resolved.all.guidelines) {
    out.push({
      uri: `${SCHEME}guidelines/${slugify(g.title)}`,
      name: `Guideline: ${g.title}`,
      mimeType: 'text/markdown',
    });
  }

  // One resource per logo variant (binary, returned as base64 blob)
  for (const v of index.resolved.all.logos.variants ?? []) {
    out.push({
      uri: `${SCHEME}logo/${slugify(v.name)}`,
      name: `Logo: ${v.name}`,
      mimeType: v.format === 'svg' ? 'image/svg+xml' : `image/${v.format}`,
    });
  }

  return out;
}

/** Read a resource by URI. Returns the MCP `ReadResourceResult` shape. */
export function readResource(uri: string, index: DesignSystemIndex): {
  contents: Array<
    | { uri: string; mimeType?: string; text: string }
    | { uri: string; mimeType?: string; blob: string }
  >;
} {
  if (!uri.startsWith(SCHEME)) {
    throw new Error(`Unsupported URI scheme: ${uri}`);
  }
  const path = uri.slice(SCHEME.length);
  const [head, ...rest] = path.split('/');

  switch (head) {
    case 'overview': {
      const inv = index.resolved.all.assetInventory;
      return textJSON(uri, { name: index.resolved.all.name, description: index.resolved.all.description, inventory: inv });
    }

    case 'tokens': {
      const format = rest[0] ?? 'css';
      const ds = index.resolved.all;
      let body: string;
      let mime = 'text/plain';
      switch (format) {
        case 'css': body = toCSSFormat(ds.colors, ds.typography); mime = 'text/css'; break;
        case 'scss': body = toSCSSFormat(ds.colors, ds.typography); mime = 'text/x-scss'; break;
        case 'tailwind': body = toTailwindFormat(ds.colors, ds.typography); mime = 'application/javascript'; break;
        case 'w3c': body = toW3CFormat(ds.colors, ds.typography); mime = 'application/json'; break;
        case 'json': body = toJSONFormat(ds.colors, ds.typography); mime = 'application/json'; break;
        default: throw new Error(`Unknown token format: ${format}`);
      }
      return { contents: [{ uri, mimeType: mime, text: body }] };
    }

    case 'colors': {
      const ds = pickResolved(index, rest[0] ?? 'all');
      return textJSON(uri, ds.colors);
    }

    case 'typography': {
      const ds = pickResolved(index, rest[0] ?? 'all');
      return textJSON(uri, ds.typography);
    }

    case 'components': {
      const ds = pickResolved(index, rest[0] ?? 'all');
      return textJSON(uri, ds.components);
    }

    case 'logos': {
      return textJSON(uri, index.resolved.all.logos);
    }

    case 'logo': {
      const slug = rest[0];
      const variant = index.resolved.all.logos.variants?.find((v) => slugify(v.name) === slug);
      if (!variant) throw new Error(`Logo variant not found: ${slug}`);
      const abs = variant.source ?? (variant.filePath ? resolve(variant.filePath) : null);
      if (!abs) throw new Error(`Logo variant has no source file: ${slug}`);
      const buf = readFileSync(abs);
      const mime = variant.format === 'svg' ? 'image/svg+xml' : `image/${variant.format}`;
      if (mime === 'image/svg+xml') {
        return { contents: [{ uri, mimeType: mime, text: buf.toString('utf-8') }] };
      }
      return { contents: [{ uri, mimeType: mime, blob: buf.toString('base64') }] };
    }

    case 'guidelines': {
      const slug = rest[0];
      const guide = index.resolved.all.guidelines.find((g) => slugify(g.title) === slug);
      if (!guide) throw new Error(`Guideline not found: ${slug}`);
      return { contents: [{ uri, mimeType: 'text/markdown', text: `# ${guide.title}\n\n${guide.content}` }] };
    }

    case 'css': {
      const all = index.resolved.all.cssFiles.map((f) => `/* ${f.filePath} */\n${f.rawContent}`).join('\n\n');
      return { contents: [{ uri, mimeType: 'text/css', text: all }] };
    }

    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}

function textJSON(uri: string, data: unknown) {
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
}
