/**
 * @file resources/index.ts
 * @description MCP Resources for BrandKit v2.
 *
 * Exposes design-system entities as addressable resources under the
 * `brand://` URI scheme so MCP clients can browse and read them
 * directly without invoking tools.
 *
 * URI patterns:
 *   brand://overview                    -- high-level overview + taste primer
 *   brand://magic_trick                 -- verbatim magic_trick.md
 *   brand://verbal/positioning          -- positioning document
 *   brand://verbal/audience             -- audience YAML
 *   brand://verbal/messaging            -- messaging document
 *   brand://verbal/differentiation      -- differentiation document
 *   brand://verbal/concepts             -- creative concepts
 *   brand://verbal/voice                -- voice document
 *   brand://visual/colors_and_type      -- colors + typography CSS
 *   brand://visual/components           -- UI primitives
 *   brand://visual/tokens               -- token specimens
 *   brand://visual/motion               -- motion system
 *   brand://visual/fonts                -- font faces
 *   brand://visual/assets               -- logos + binary assets
 */

import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import type { DesignSystemIndex } from '../indexer/types.js';

import * as brandOverview    from '../tools/get-brand-overview.js';
import * as magicTrick       from '../tools/get-magic-trick.js';
import * as positioning      from '../tools/get-positioning.js';
import * as audience         from '../tools/get-audience.js';
import * as messaging        from '../tools/get-messaging.js';
import * as differentiation  from '../tools/get-differentiation.js';
import * as concepts         from '../tools/get-concepts.js';
import * as voice            from '../tools/get-voice.js';
import * as colorsAndType    from '../tools/get-colors-and-type.js';
import * as components       from '../tools/get-components.js';
import * as tokens           from '../tools/get-tokens.js';
import * as motion           from '../tools/get-motion.js';
import * as fonts            from '../tools/get-fonts.js';
import * as assets           from '../tools/get-assets.js';

const RESOURCE_DEFS: Array<{ uri: string; name: string; description: string }> = [
  { uri: 'brand://overview',               name: 'Brand overview',  description: 'High-level overview + taste primer' },
  { uri: 'brand://magic_trick',            name: 'Magic trick',     description: 'Human-authored taste primer' },
  { uri: 'brand://verbal/positioning',     name: 'Positioning',     description: 'Verbal: positioning document' },
  { uri: 'brand://verbal/audience',        name: 'Audience',        description: 'Verbal: audience YAML' },
  { uri: 'brand://verbal/messaging',       name: 'Messaging',       description: 'Verbal: messaging document' },
  { uri: 'brand://verbal/differentiation', name: 'Differentiation', description: 'Verbal: differentiation document' },
  { uri: 'brand://verbal/concepts',        name: 'Concepts',        description: 'Verbal: creative concepts' },
  { uri: 'brand://verbal/voice',           name: 'Voice',           description: 'Verbal: voice document' },
  { uri: 'brand://visual/colors_and_type', name: 'Colors and Type', description: 'Visual: colors + typography CSS' },
  { uri: 'brand://visual/components',      name: 'Components',      description: 'Visual: UI primitives' },
  { uri: 'brand://visual/tokens',          name: 'Tokens',          description: 'Visual: token specimens' },
  { uri: 'brand://visual/motion',          name: 'Motion',          description: 'Visual: motion system' },
  { uri: 'brand://visual/fonts',           name: 'Fonts',           description: 'Visual: font faces' },
  { uri: 'brand://visual/assets',          name: 'Assets',          description: 'Visual: logos + binary assets' },
];

export function listResources(_index: DesignSystemIndex): Resource[] {
  return RESOURCE_DEFS.map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: 'application/json',
  }));
}

export async function readResource(uri: string, index: DesignSystemIndex): Promise<{
  contents: Array<{ uri: string; mimeType?: string; text: string }>;
}> {
  const route = (handlerOutput: { type: 'text'; text: string }[]) => ({
    contents: [{ uri, mimeType: 'application/json', text: handlerOutput[0].text }],
  });

  switch (uri) {
    case 'brand://overview':               return route(brandOverview.handler(index));
    case 'brand://magic_trick':            return route(magicTrick.handler(index));
    case 'brand://verbal/positioning':     return route(positioning.handler(index));
    case 'brand://verbal/audience':        return route(audience.handler(index));
    case 'brand://verbal/messaging':       return route(messaging.handler(index));
    case 'brand://verbal/differentiation': return route(differentiation.handler(index));
    case 'brand://verbal/concepts':        return route(concepts.handler(index));
    case 'brand://verbal/voice':           return route(voice.handler(index));
    case 'brand://visual/colors_and_type': return route(colorsAndType.handler(index, { context: 'base' }));
    case 'brand://visual/components':      return route(components.handler(index, { context: 'base' }));
    case 'brand://visual/tokens':          return route(tokens.handler(index, { context: 'base' }));
    case 'brand://visual/motion':          return route(motion.handler(index, { context: 'base' }));
    case 'brand://visual/fonts':           return route(fonts.handler(index, { context: 'base' }));
    case 'brand://visual/assets':          return route(assets.handler(index, { context: 'base' }));
    default:
      return { contents: [{ uri, mimeType: 'text/plain', text: `Unknown resource: ${uri}` }] };
  }
}
