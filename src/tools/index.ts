/**
 * @file tools/index.ts
 * @description Registers all MCP primitives (tools, resources, prompts)
 * on the server instance. Imports the request schemas synchronously so
 * handlers are wired up before the transport connects.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { DesignSystemIndex } from '../indexer/types.js';

import * as brandOverview    from './get-brand-overview.js';
import * as magicTrick       from './get-magic-trick.js';
import * as positioning      from './get-positioning.js';
import * as audience         from './get-audience.js';
import * as messaging        from './get-messaging.js';
import * as differentiation  from './get-differentiation.js';
import * as concepts         from './get-concepts.js';
import * as voice            from './get-voice.js';
import * as colorsAndType    from './get-colors-and-type.js';
import * as assets           from './get-assets.js';
import * as fonts            from './get-fonts.js';
import * as components       from './get-components.js';
import * as tokens           from './get-tokens.js';
import * as motion           from './get-motion.js';
import * as css              from './get-css.js';
import * as searchBrand      from './search-brand.js';
import * as validateUsage    from './validate-usage.js';
import * as contextDiff      from './get-context-diff.js';
import * as syncBrandDocs    from './sync-brand-docs.js';

import { listResources, readResource } from '../resources/index.js';
import { listPrompts, getPrompt } from '../prompts/index.js';

/** All tool modules in registration order (v2 surface, 19 tools). */
const ALL_TOOLS = [
  brandOverview,
  magicTrick,
  positioning,
  audience,
  messaging,
  differentiation,
  concepts,
  voice,
  colorsAndType,
  assets,
  fonts,
  components,
  tokens,
  motion,
  css,
  searchBrand,
  validateUsage,
  contextDiff,
  syncBrandDocs,
] as const;

/**
 * Registers all design system tools, resources, and prompts on the MCP server.
 *
 * @param server - MCP Server instance
 * @param getIndex - Function that returns the current design system index
 *                   (supports hot-reload by always fetching the latest)
 */
export function registerAllTools(
  server: Server,
  getIndex: () => DesignSystemIndex,
  context?: { configPath: string; outputDir: string },
): void {
  // ---- Tools --------------------------------------------------------------

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.TOOL_NAME,
      description: t.TOOL_DESCRIPTION,
      inputSchema: t.INPUT_SCHEMA,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const index = getIndex();

    try {
      switch (name) {
        case brandOverview.TOOL_NAME:    return { content: brandOverview.handler(index) };
        case magicTrick.TOOL_NAME:       return { content: magicTrick.handler(index) };
        case positioning.TOOL_NAME:      return { content: positioning.handler(index) };
        case audience.TOOL_NAME:         return { content: audience.handler(index) };
        case messaging.TOOL_NAME:        return { content: messaging.handler(index) };
        case differentiation.TOOL_NAME:  return { content: differentiation.handler(index) };
        case concepts.TOOL_NAME:         return { content: concepts.handler(index) };
        case voice.TOOL_NAME:            return { content: voice.handler(index) };
        case colorsAndType.TOOL_NAME:    return { content: colorsAndType.handler(index, args as never) };
        case assets.TOOL_NAME:           return { content: assets.handler(index, args as never) };
        case fonts.TOOL_NAME:            return { content: fonts.handler(index, args as never) };
        case components.TOOL_NAME:       return { content: components.handler(index, args as never) };
        case tokens.TOOL_NAME:           return { content: tokens.handler(index, args as never) };
        case motion.TOOL_NAME:           return { content: motion.handler(index, args as never) };
        case css.TOOL_NAME:              return { content: css.handler(index, args as never) };
        case searchBrand.TOOL_NAME:      return { content: searchBrand.handler(index, args as never) };
        case validateUsage.TOOL_NAME:    return { content: validateUsage.handler(index, args as never) };
        case contextDiff.TOOL_NAME:      return { content: contextDiff.handler(index, args as never) };
        case syncBrandDocs.TOOL_NAME:    return { content: await syncBrandDocs.handler(index, args as never, context) };
        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error executing ${name}: ${message}` }],
        isError: true,
      };
    }
  });

  // ---- Resources ----------------------------------------------------------

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(getIndex()),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return readResource(request.params.uri, getIndex());
  });

  // ---- Prompts ------------------------------------------------------------

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listPrompts(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return getPrompt(request.params.name, request.params.arguments ?? {}, getIndex());
  });
}
