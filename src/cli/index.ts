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

const program = new Command();

program
  .name('brandkit-mcp')
  .description('Expose your company\'s design system to AI tools via the Model Context Protocol')
  .version('0.1.0');

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
  .option('--transport <type>', 'Transport type: stdio or sse', 'stdio')
  .option('--port <number>', 'Port for SSE transport', '3001')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--watch', 'Enable hot reload on file changes')
  .action(async (options) => {
    await startServer({
      transport: options.transport as 'stdio' | 'sse',
      port: parseInt(options.port, 10),
      configPath: options.config,
      watch: options.watch,
    });
  });

program
  .command('preview')
  .description('Start the local preview server to browse the design system visually')
  .option('--port <number>', 'Port for preview server', '3000')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--watch', 'Enable hot reload on file changes')
  .option('--open', 'Open browser automatically')
  .action(async (options) => {
    const { createPreviewServer } = await import('../preview/server.js');
    const { loadConfig, resolveConfigPaths } = await import('../config/loader.js');
    const { buildDesignSystemIndex } = await import('../indexer/index.js');
    const { watchBrandDirectory } = await import('../indexer/hot-reload.js');

    const config = resolveConfigPaths(loadConfig(options.config), process.cwd());
    let index = await buildDesignSystemIndex(config);
    const port = parseInt(options.port, 10) || 3000;

    const app = createPreviewServer(index, config);
    app.listen(port, () => {
      console.log(`Preview server running at http://localhost:${port}`);
    });

    if (options.watch) {
      watchBrandDirectory(config, (newIndex) => {
        index = newIndex;
        console.log('Design system re-indexed');
      });
    }
  });

program
  .command('docs')
  .description('Generate project documentation files (CLAUDE.md, AGENTS.md, SKILLS.md, DESIGN.md)')
  .option('--config <path>', 'Path to brandkit.config.yaml')
  .option('--output <dir>', 'Output directory for generated docs', '.')
  .action(docsCommand);

program.parse();

