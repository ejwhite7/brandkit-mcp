#!/usr/bin/env node
/**
 * @file cli/index.ts
 * @description BrandKit MCP CLI entry point.
 * Provides commands to initialize a new brand directory, validate the design
 * system, start the MCP server, launch the preview server, and generate
 * project documentation files.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { docsCommand } from './commands/docs.js';
import { previewCommand } from './commands/preview.js';
import { startServer } from '../index.js';
import { getPackageVersion } from '../version.js';

const program = new Command();

program
  .name('brandkit-mcp')
  .description('Expose your company\'s design system to AI tools via the Model Context Protocol')
  .version(getPackageVersion());

program
  .command('init')
  .description('Initialize a new brand directory with starter files and configuration')
  .argument('[directory]', 'Target directory', '.')
  .option('--name <name>', 'Brand name')
  .option('--force', 'Overwrite existing files')
  .action(initCommand);

program
  .command('validate')
  .description('Validate the design system configuration and scan for issues')
  .argument('[config-path]', 'Path to brandkit.config.yaml')
  .action(validateCommand);

program
  .command('serve')
  .description('Start the MCP server')
  .option('--transport <type>', 'Transport type: stdio, sse, or http (Streamable HTTP)')
  .option('--port <number>', 'Port for network transports')
  .option('--host <host>', 'Host for network transports')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--watch', 'Enable hot reload on file changes')
  .option('--allow-write-tools', 'Expose write-capable tools on network transports')
  .action(async (options) => {
    await startServer({
      transport: options.transport as 'stdio' | 'sse' | 'http',
      port: options.port === undefined ? undefined : parseInt(options.port, 10),
      host: options.host,
      configPath: options.config,
      watch: options.watch,
      allowWriteTools: options.allowWriteTools,
    });
  });

program
  .command('preview')
  .description('Start the local preview UI for browsing the brand atomic system')
  .option('--port <number>', 'Port for preview server')
  .option('--host <host>', 'Host for preview server')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--watch', 'Enable hot reload on file changes')
  .option('--open', 'Open browser automatically')
  .action(async (options) => {
    await previewCommand(options);
  });

program
  .command('docs')
  .description('Generate project documentation files (CLAUDE.md, AGENTS.md, SKILLS.md, DESIGN.md, PRODUCT.md)')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--output <dir>', 'Output directory for generated docs', '.')
  .action(docsCommand);

// If invoked with no subcommand and no flags, default to `serve` over stdio.
// This is the behavior MCP clients (Claude Desktop, Glama mcp-proxy, etc.)
// expect when they spawn `brandkit-mcp` as a child process: a stdio MCP
// server that speaks JSON-RPC on stdin/stdout. Without this, running
// `brandkit-mcp` bare prints help and exits, which clients interpret as a
// connection-closed error.
const userArgs = process.argv.slice(2);
const knownCommands = new Set(['init', 'validate', 'serve', 'preview', 'docs', 'help']);
const isHelpOrVersion = userArgs.some((a) => ['-h', '--help', '-V', '--version'].includes(a));
const hasSubcommand = userArgs.length > 0 && knownCommands.has(userArgs[0]);
if (!hasSubcommand && !isHelpOrVersion) {
  // Inject `serve` so all flags the user passed (e.g. --config) still apply.
  process.argv.splice(2, 0, 'serve');
}

program.parse();
