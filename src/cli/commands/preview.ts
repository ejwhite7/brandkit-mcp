/**
 * @file commands/preview.ts
 * @description Implementation of the `brandkit-mcp preview` command.
 * Starts the local preview UI for browsing the brand atomic system.
 */

import { dirname } from 'path';
import { exec } from 'child_process';
import { loadConfigWithPath, resolveConfigPaths } from '../../config/loader.js';
import { buildDesignSystemIndex } from '../../indexer/index.js';
import { watchBrandDirectory } from '../../indexer/hot-reload.js';
import {
  assertPreviewLoopbackHost,
  createPreviewServer,
  type IndexRef,
} from '../../preview/server.js';
import type { Server as HttpServer } from 'http';
import { formatHostForUrl } from '../../network.js';

export interface PreviewOptions {
  port?: string;
  host?: string;
  config?: string;
  watch?: boolean;
  open?: boolean;
}

/**
 * Handles the `brandkit-mcp preview` command.
 */
export async function previewCommand(options: PreviewOptions): Promise<HttpServer> {
  // Resolve relative paths against the config file's own directory (same
  // portability fix as startServer in src/index.ts).
  const { config: rawConfig, filePath } = loadConfigWithPath(options.config);
  const config = resolveConfigPaths(rawConfig, dirname(filePath));
  const parsed = parseInt(options.port ?? '', 10);
  const port = Number.isNaN(parsed) ? config.preview.port : parsed;
  const host = options.host ?? config.preview.host;

  // Fail before indexing or starting a watcher so a preview can never be
  // accidentally exposed on a LAN or wildcard listener.
  assertPreviewLoopbackHost(host);

  console.log(`Building design system index for "${config.brand.name}"...`);
  const ref: IndexRef = { current: await buildDesignSystemIndex(config) };

  if (options.watch) {
    console.log('File watching enabled');
    watchBrandDirectory(config, (newIndex) => {
      ref.current = newIndex;
      console.log('Index updated');
    });
  }

  const app = createPreviewServer(ref, config, { host, port });

  const server = app.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address !== null ? address.port : port;
    const url = `http://${formatHostForUrl(host)}:${actualPort}`;
    console.log(`Preview running at ${url}`);
    if (options.open) {
      const opener =
        process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'start ""'
        : 'xdg-open';
      exec(`${opener} ${url}`, () => {
        // Best-effort: a failed browser launch is not an error.
      });
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Pass a different one with --port.`);
    } else {
      console.error('Preview server error:', err.message);
    }
    process.exit(1);
  });

  return server;
}
