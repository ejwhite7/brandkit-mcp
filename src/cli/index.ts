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
  .option('--transport <type>', 'Transport type: stdio, sse, or http (Streamable HTTP)', 'stdio')
  .option('--port <number>', 'Port for SSE transport', '3001')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--watch', 'Enable hot reload on file changes')
  .action(async (options) => {
    await startServer({
      transport: options.transport as 'stdio' | 'sse' | 'http',
      port: parseInt(options.port, 10),
      configPath: options.config,
      watch: options.watch,
    });
  });

program
  .command('preview')
  .description('Local preview UI (temporarily disabled — being rewritten for v2)')
  .option('--port <number>', 'Port for preview server', '3000')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--watch', 'Enable hot reload on file changes')
  .option('--open', 'Open browser automatically')
  .action(() => {
    console.error(
      'The visual preview UI has not been rewritten for the v2 brand atomic system layout.\n' +
        'The MCP server (`brandkit-mcp serve`) is unaffected and works correctly.\n' +
        'Track progress: https://github.com/ejwhite7/brandkit-mcp/issues',
    );
    process.exit(1);
  });

program
  .command('docs')
  .description('Generate project documentation files (CLAUDE.md, AGENTS.md, SKILLS.md, DESIGN.md)')
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
