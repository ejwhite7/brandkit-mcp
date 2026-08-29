import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer, Server as NodeHttpServer, type Server as HttpServer } from 'http';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const watcherMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(async () => {}),
}));

vi.mock('../indexer/hot-reload.js', () => ({
  watchBrandDirectory: (...args: unknown[]) => {
    watcherMocks.start(...args);
    return watcherMocks.stop;
  },
}));

import { startServer, type Transport } from '../index.js';

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
  '__test_fixtures__',
  'v2',
  'full',
);

const servers: HttpServer[] = [];
const tempDirs: string[] = [];
const initialSignalListeners = {
  SIGINT: new Set(process.listeners('SIGINT')),
  SIGTERM: new Set(process.listeners('SIGTERM')),
};

function writeConfig(transport: Transport): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-startup-'));
  tempDirs.push(dir);
  const configPath = join(dir, 'brandkit.config.yaml');
  writeFileSync(
    configPath,
    `version: 2\nbrand:\n  name: Startup Test\n  root: ${JSON.stringify(fixtureRoot)}\nserver:\n  transport: ${transport}\n`,
  );
  return configPath;
}

async function listenOnEphemeralPort(): Promise<HttpServer> {
  const server = createServer();
  await new Promise<void>((resolveListening, rejectListening) => {
    server.once('error', rejectListening);
    server.listen(0, '127.0.0.1', resolveListening);
  });
  servers.push(server);
  return server;
}

async function closeServer(server: HttpServer): Promise<void> {
  server.closeAllConnections();
  if (!server.listening) return;
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

beforeEach(() => {
  watcherMocks.start.mockReset();
  watcherMocks.stop.mockReset();
  watcherMocks.stop.mockResolvedValue(undefined);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    for (const listener of process.listeners(signal)) {
      if (!initialSignalListeners[signal].has(listener)) process.removeListener(signal, listener);
    }
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('network server startup', () => {
  it.each<Transport>(['http', 'sse'])(
    'rejects an occupied %s port without an uncaught error or watcher leak',
    async (transport) => {
      const occupied = await listenOnEphemeralPort();
      const address = occupied.address();
      if (typeof address !== 'object' || address === null) throw new Error('missing occupied address');

      const uncaught: Error[] = [];
      const onUncaught = (error: Error): void => {
        uncaught.push(error);
      };
      const signalCounts = {
        SIGINT: process.listenerCount('SIGINT'),
        SIGTERM: process.listenerCount('SIGTERM'),
      };
      process.on('uncaughtException', onUncaught);
      try {
        await expect(startServer({
          configPath: writeConfig(transport),
          transport,
          host: '127.0.0.1',
          port: address.port,
          watch: true,
        })).rejects.toMatchObject({ code: 'EADDRINUSE' });
        await new Promise<void>((resolveTick) => setImmediate(resolveTick));
      } finally {
        process.removeListener('uncaughtException', onUncaught);
      }

      expect(uncaught).toEqual([]);
      expect(watcherMocks.start).not.toHaveBeenCalled();
      expect(process.listenerCount('SIGINT')).toBe(signalCounts.SIGINT);
      expect(process.listenerCount('SIGTERM')).toBe(signalCounts.SIGTERM);
    },
  );

  it.each<Transport>(['http', 'sse'])(
    'resolves %s only after the server is listening on its ephemeral port',
    async (transport) => {
      const result = await startServer({
        configPath: writeConfig(transport),
        transport,
        host: '127.0.0.1',
        port: 0,
      });
      if (!result) throw new Error('expected an HTTP server');
      servers.push(result);

      expect(result.listening).toBe(true);
      const address = result.address();
      expect(typeof address === 'object' && address !== null && address.port).toBeGreaterThan(0);
      expect(result.listenerCount('error')).toBe(0);
    },
  );

  it('preserves runtime error handling after a successful listen', async () => {
    const result = await startServer({
      configPath: writeConfig('http'),
      transport: 'http',
      host: '127.0.0.1',
      port: 0,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);

    const runtimeError = new Error('runtime failure');
    const listener = vi.fn();
    result.once('error', listener);
    result.emit('error', runtimeError);

    expect(listener).toHaveBeenCalledWith(runtimeError);
    expect(result.listenerCount('error')).toBe(0);
  });

  it('stops its watcher and removes signal listeners when an embedder closes the server', async () => {
    let releaseWatcher: (() => void) | undefined;
    const watcherStopped = new Promise<void>((resolveStopped) => {
      releaseWatcher = resolveStopped;
    });
    watcherMocks.stop.mockReturnValueOnce(watcherStopped);
    const signalCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
    };
    const result = await startServer({
      configPath: writeConfig('http'),
      transport: 'http',
      host: '127.0.0.1',
      port: 0,
      watch: true,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);

    expect(watcherMocks.start).toHaveBeenCalledOnce();
    expect(process.listenerCount('SIGINT')).toBe(signalCounts.SIGINT + 1);
    expect(process.listenerCount('SIGTERM')).toBe(signalCounts.SIGTERM + 1);

    // Watcher shutdown may involve filesystem I/O, but must not hold Node's
    // server close callback open.
    await expect(closeServer(result)).resolves.toBeUndefined();
    expect(watcherMocks.stop).toHaveBeenCalledOnce();
    expect(process.listenerCount('SIGINT')).toBe(signalCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(signalCounts.SIGTERM);

    releaseWatcher?.();
    await watcherStopped;
  });

  it('runs watcher cleanup once when signal and server-close paths overlap', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const priorTermListeners = new Set(process.listeners('SIGTERM'));
    const result = await startServer({
      configPath: writeConfig('sse'),
      transport: 'sse',
      host: '127.0.0.1',
      port: 0,
      watch: true,
    });
    if (!result) throw new Error('expected an HTTP server');
    servers.push(result);
    const shutdown = process.listeners('SIGTERM')
      .find((listener) => !priorTermListeners.has(listener));
    if (!shutdown) throw new Error('missing server shutdown listener');

    shutdown('SIGTERM');
    await closeServer(result);
    await new Promise<void>((resolveTick) => setImmediate(resolveTick));

    expect(watcherMocks.stop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(143);
  });

  it('closes a bound server and removes signal listeners if watcher startup fails', async () => {
    const closeAllConnections = vi.spyOn(NodeHttpServer.prototype, 'closeAllConnections');
    const close = vi.spyOn(NodeHttpServer.prototype, 'close');
    watcherMocks.start.mockImplementationOnce(() => {
      throw new Error('watcher startup failed');
    });
    const signalCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
    };

    await expect(startServer({
      configPath: writeConfig('http'),
      transport: 'http',
      host: '127.0.0.1',
      port: 0,
      watch: true,
    })).rejects.toThrow('watcher startup failed');

    expect(closeAllConnections).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(watcherMocks.stop).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(signalCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(signalCounts.SIGTERM);
  });
});
