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

import * as brandOverview from './get-brand-overview.js';
import * as colors from './get-colors.js';
import * as typography from './get-typography.js';
import * as logos from './get-logos.js';
import * as components from './get-components.js';
import * as guidelines from './get-guidelines.js';
import * as tokens from './get-tokens.js';
import * as textures from './get-textures.js';
import * as css from './get-css.js';
import * as searchBrand from './search-brand.js';
import * as contextDiff from './get-context-diff.js';
import * as validateUsage from './validate-usage.js';

import { listResources, readResource } from '../resources/index.js';
import { listPrompts, getPrompt } from '../prompts/index.js';

/** All tool modules in registration order. */
const ALL_TOOLS = [
  brandOverview,
  colors,
  typography,
  logos,
  components,
  guidelines,
  tokens,
  textures,
  css,
  searchBrand,
  contextDiff,
  validateUsage,
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
        case brandOverview.TOOL_NAME:
          return { content: brandOverview.handler(index) };
        case colors.TOOL_NAME:
          return { content: colors.handler(index, args as never) };
        case typography.TOOL_NAME:
          return { content: typography.handler(index, args as never) };
        case logos.TOOL_NAME:
          return { content: await logos.handler(index, args as never) };
        case components.TOOL_NAME:
          return { content: components.handler(index, args as never) };
        case guidelines.TOOL_NAME:
          return { content: guidelines.handler(index, args as never) };
        case tokens.TOOL_NAME:
          return { content: tokens.handler(index, args as never) };
        case textures.TOOL_NAME:
          return { content: textures.handler(index, args as never) };
        case css.TOOL_NAME:
          return { content: css.handler(index, args as never) };
        case searchBrand.TOOL_NAME:
          return { content: searchBrand.handler(index, args as never) };
        case contextDiff.TOOL_NAME:
          return { content: contextDiff.handler(index, args as never) };
        case validateUsage.TOOL_NAME:
          return { content: validateUsage.handler(index, args as never) };
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
