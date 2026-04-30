/**
 * @file tools/index.ts
 * @description Barrel file that registers all 12 MCP tools on the server instance.
 * Exports registerAllTools() which is called during server initialization.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
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
 * Registers all 12 design system tools on the MCP server.
 * Sets up the tools/list handler (returns tool metadata) and the
 * tools/call handler (dispatches to the appropriate tool handler).
 *
 * @param server - MCP Server instance
 * @param getIndex - Function that returns the current design system index
 *                   (supports hot-reload by always fetching the latest)
 */
export function registerAllTools(
  server: Server,
  getIndex: () => DesignSystemIndex,
): void {
  // Use the SDK's request schemas for proper typing
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const setupHandlers = async () => {
    const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
      '@modelcontextprotocol/sdk/types.js'
    );

    // Register tool list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: ALL_TOOLS.map((t) => ({
        name: t.TOOL_NAME,
        description: t.TOOL_DESCRIPTION,
        inputSchema: t.INPUT_SCHEMA,
      })),
    }));

    // Register tool call handler
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
  };

  // Execute async setup synchronously during registration
  setupHandlers().catch((err) => {
    console.error('[brandkit-mcp] Failed to register tool handlers:', err);
  });
}

