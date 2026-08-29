/**
 * Central containment policy for all files read from a configured brand root.
 *
 * The configured root itself may be a symlink. Symlinks below it are accepted
 * only when their final target remains below that root's canonical path. File
 * reads open the canonical target with O_NOFOLLOW (where supported), then
 * compare the opened descriptor with the path before consuming any bytes.
 */
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';

export interface BrandIngestionLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  maxDepth: number;
}

export const DEFAULT_BRAND_INGESTION_LIMITS: Readonly<BrandIngestionLimits> = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  maxFiles: 1_000,
  maxDepth: 16,
});

export const MAX_BRAND_INGESTION_LIMITS: Readonly<BrandIngestionLimits> = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxFiles: 10_000,
  maxDepth: 64,
});

export class BrandPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandPathError';
  }
}

export class BrandIngestionLimitError extends BrandPathError {
  constructor(message: string) {
    super(message);
    this.name = 'BrandIngestionLimitError';
  }
}

interface ResolvedEntry {
  requestedPath: string;
  realPath: string;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function sameFile(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

export class BrandReadPolicy {
  readonly configuredRoot: string;
  readonly realRoot: string;
  readonly limits: Readonly<BrandIngestionLimits>;
  private readonly accountedFiles = new Map<string, number>();
  private readonly accountedDirectories = new Map<string, number>();
  private totalBytes = 0;
  private traversalEntries = 0;
  private limitFailure: BrandIngestionLimitError | undefined;

  constructor(rootDir: string, limits: Partial<BrandIngestionLimits> = {}) {
    this.configuredRoot = resolve(rootDir);
    this.limits = validateLimits({ ...DEFAULT_BRAND_INGESTION_LIMITS, ...limits });
    try {
      this.realRoot = realpathSync.native(this.configuredRoot);
      if (!lstatSync(this.realRoot).isDirectory()) {
        throw new BrandPathError(`Brand root is not a directory: ${this.configuredRoot}`);
      }
    } catch (err) {
      if (err instanceof BrandPathError) throw err;
      throw new BrandPathError(
        `Could not resolve brand root ${this.configuredRoot}: ${(err as Error).message}`,
      );
    }
  }

  /** Reject a path that is lexically outside the configured root, even if absent. */
  assertPath(path: string): string {
    const requestedPath = resolve(path);
    if (!isWithin(this.configuredRoot, requestedPath)) {
      throw new BrandPathError('Brand path is outside configured root');
    }
    return requestedPath;
  }

  isFile(path: string): boolean {
    this.throwIfLimitFailed();
    const entry = this.resolveExisting(path);
    if (!entry) return false;
    const stats = lstatSync(entry.realPath);
    if (!stats.isFile()) return false;
    this.accountFile(entry.requestedPath, stats);
    return true;
  }

  isDirectory(path: string): boolean {
    this.throwIfLimitFailed();
    const entry = this.resolveExisting(path);
    if (!entry) return false;
    return lstatSync(entry.realPath).isDirectory();
  }

  /** Return the canonical identity used to de-duplicate directory traversal. */
  directoryIdentity(path: string): string | undefined {
    this.throwIfLimitFailed();
    const entry = this.resolveExisting(path);
    if (!entry) return undefined;
    if (!lstatSync(entry.realPath).isDirectory()) {
      throw new BrandPathError(`Brand input is not a directory: ${entry.requestedPath}`);
    }
    return entry.realPath;
  }

  readFile(path: string): Buffer;
  readFile(path: string, encoding: BufferEncoding): string;
  readFile(path: string, encoding?: BufferEncoding): Buffer | string {
    this.throwIfLimitFailed();
    const entry = this.resolveExisting(path);
    if (!entry) throw new BrandPathError(`Brand file does not exist: ${resolve(path)}`);

    const noFollow = constants.O_NOFOLLOW ?? 0;
    let fd: number | undefined;
    try {
      fd = openSync(entry.realPath, constants.O_RDONLY | noFollow);
      const opened = fstatSync(fd);
      if (!opened.isFile()) {
        throw new BrandPathError(`Brand input is not a regular file: ${entry.requestedPath}`);
      }
      this.accountFile(entry.requestedPath, opened);

      // Re-resolve the requested path and compare inode/device identity. This
      // detects replacements of the file or an ancestor between realpath/open.
      const verifiedRealPath = realpathSync.native(entry.requestedPath);
      this.assertCanonicalContainment(verifiedRealPath);
      const verified = statSync(verifiedRealPath);
      if (verifiedRealPath !== entry.realPath || !sameFile(opened, verified)) {
        throw new BrandPathError(`Brand file changed while it was being opened: ${entry.requestedPath}`);
      }

      const content = encoding ? readFileSync(fd, encoding) : readFileSync(fd);
      const bytesRead = typeof content === 'string' ? Buffer.byteLength(content, encoding) : content.length;
      // fstat is the primary pre-allocation guard. Re-account the returned
      // bytes as a fail-closed defense if the same inode grew during readFile.
      this.accountFile(entry.requestedPath, { dev: opened.dev, ino: opened.ino, size: bytesRead });
      return content;
    } catch (err) {
      if (err instanceof BrandPathError) throw err;
      throw new BrandPathError(`Could not safely read ${entry.requestedPath}: ${(err as Error).message}`);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  readDirectory(path: string): string[] {
    this.throwIfLimitFailed();
    const entry = this.resolveExisting(path);
    if (!entry) return [];

    const noFollow = constants.O_NOFOLLOW ?? 0;
    const directoryFlag = constants.O_DIRECTORY ?? 0;
    let fd: number | undefined;
    try {
      fd = openSync(entry.realPath, constants.O_RDONLY | noFollow | directoryFlag);
      const opened = fstatSync(fd);
      if (!opened.isDirectory()) {
        throw new BrandPathError(`Brand input is not a directory: ${entry.requestedPath}`);
      }
      const identity = `${opened.dev.toString()}:${opened.ino.toString()}`;
      const previouslyAccounted = this.accountedDirectories.get(identity) ?? 0;
      const entries: string[] = [];
      const directoryHandle = opendirSync(entry.realPath);
      try {
        let item;
        while ((item = directoryHandle.readSync()) !== null) {
          entries.push(item.name);
          if (entries.length > previouslyAccounted) {
            const nextEntries = this.traversalEntries + entries.length - previouslyAccounted;
            const maxTraversalEntries = this.limits.maxFiles * 4;
            if (nextEntries > maxTraversalEntries) {
              const brandPath = relative(this.configuredRoot, entry.requestedPath).replace(/\\/g, '/') || '.';
              this.fail(
                `Brand ingestion traversal entry limit exceeded at ${brandPath}: more than ${maxTraversalEntries} entries`,
              );
            }
          }
        }
      } finally {
        directoryHandle.closeSync();
      }
      const verifiedRealPath = realpathSync.native(entry.requestedPath);
      this.assertCanonicalContainment(verifiedRealPath);
      const verified = statSync(verifiedRealPath);
      if (verifiedRealPath !== entry.realPath || !sameFile(opened, verified)) {
        throw new BrandPathError(`Brand directory changed while it was being read: ${entry.requestedPath}`);
      }
      if (entries.length > previouslyAccounted) {
        this.traversalEntries += entries.length - previouslyAccounted;
        this.accountedDirectories.set(identity, entries.length);
      }
      return entries;
    } catch (err) {
      if (err instanceof BrandPathError) throw err;
      throw new BrandPathError(`Could not safely read directory ${entry.requestedPath}: ${(err as Error).message}`);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  private resolveExisting(path: string): ResolvedEntry | undefined {
    const requestedPath = this.assertPath(path);
    try {
      // lstat first so the existence check itself does not silently follow a
      // final symlink. realpath below applies the common containment rule.
      lstatSync(requestedPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
      throw new BrandPathError(`Could not inspect brand path ${requestedPath}: ${(err as Error).message}`);
    }
    this.assertDepth(requestedPath);

    let realPath: string;
    try {
      realPath = realpathSync.native(requestedPath);
    } catch (err) {
      throw new BrandPathError(`Could not resolve brand path ${requestedPath}: ${(err as Error).message}`);
    }
    this.assertCanonicalContainment(realPath);
    this.assertDepthFromRoot(this.realRoot, realPath);
    return { requestedPath, realPath };
  }

  private assertCanonicalContainment(realPath: string): void {
    if (!isWithin(this.realRoot, realPath)) {
      throw new BrandPathError('Brand path resolves outside configured root');
    }
  }

  /** Re-throw the first budget failure after tolerant parsers finish unwinding. */
  assertWithinLimits(): void {
    this.throwIfLimitFailed();
  }

  private assertDepth(requestedPath: string): void {
    this.assertDepthFromRoot(this.configuredRoot, requestedPath);
  }

  private assertDepthFromRoot(root: string, path: string): void {
    const rel = relative(root, path);
    const depth = rel === '' ? 0 : rel.split(sep).length;
    if (depth > this.limits.maxDepth) {
      this.fail(
        `Brand ingestion traversal depth limit exceeded at ${rel.replace(/\\/g, '/')}: ${depth} levels; maximum ${this.limits.maxDepth}`,
      );
    }
  }

  private accountFile(
    requestedPath: string,
    stats: { dev: number | bigint; ino: number | bigint; size: number },
  ): void {
    const identity = `${stats.dev.toString()}:${stats.ino.toString()}`;
    const accountedSize = this.accountedFiles.get(identity);
    if (accountedSize !== undefined && stats.size <= accountedSize) return;

    const brandPath = relative(this.configuredRoot, requestedPath).replace(/\\/g, '/');
    if (stats.size > this.limits.maxFileBytes) {
      this.fail(
        `Brand ingestion per-file byte limit exceeded at ${brandPath}: ${stats.size} bytes; maximum ${this.limits.maxFileBytes}`,
      );
    }

    const nextFiles = this.accountedFiles.size + (accountedSize === undefined ? 1 : 0);
    if (nextFiles > this.limits.maxFiles) {
      this.fail(
        `Brand ingestion file-count limit exceeded at ${brandPath}: ${nextFiles} files; maximum ${this.limits.maxFiles}`,
      );
    }

    const nextTotal = this.totalBytes + stats.size - (accountedSize ?? 0);
    if (nextTotal > this.limits.maxTotalBytes) {
      this.fail(
        `Brand ingestion aggregate byte limit exceeded at ${brandPath}: ${nextTotal} bytes; maximum ${this.limits.maxTotalBytes}`,
      );
    }

    this.accountedFiles.set(identity, stats.size);
    this.totalBytes = nextTotal;
  }

  private fail(message: string): never {
    const error = new BrandIngestionLimitError(message);
    this.limitFailure ??= error;
    throw this.limitFailure;
  }

  private throwIfLimitFailed(): void {
    if (this.limitFailure) throw this.limitFailure;
  }
}

function validateLimits(limits: BrandIngestionLimits): Readonly<BrandIngestionLimits> {
  for (const key of Object.keys(limits) as Array<keyof BrandIngestionLimits>) {
    const value = limits[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BRAND_INGESTION_LIMITS[key]) {
      throw new BrandIngestionLimitError(
        `Invalid brand ingestion limit ${key}: use an integer from 1 to ${MAX_BRAND_INGESTION_LIMITS[key]}`,
      );
    }
  }
  if (limits.maxTotalBytes < limits.maxFileBytes) {
    throw new BrandIngestionLimitError(
      'Invalid brand ingestion limits: maxTotalBytes must be at least maxFileBytes',
    );
  }
  return Object.freeze({ ...limits });
}
