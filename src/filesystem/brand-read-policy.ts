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
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';

export class BrandPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandPathError';
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

  constructor(rootDir: string) {
    this.configuredRoot = resolve(rootDir);
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
    const entry = this.resolveExisting(path);
    if (!entry) return false;
    return lstatSync(entry.realPath).isFile();
  }

  isDirectory(path: string): boolean {
    const entry = this.resolveExisting(path);
    if (!entry) return false;
    return lstatSync(entry.realPath).isDirectory();
  }

  /** Return the canonical identity used to de-duplicate directory traversal. */
  directoryIdentity(path: string): string | undefined {
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

      // Re-resolve the requested path and compare inode/device identity. This
      // detects replacements of the file or an ancestor between realpath/open.
      const verifiedRealPath = realpathSync.native(entry.requestedPath);
      this.assertCanonicalContainment(verifiedRealPath);
      const verified = statSync(verifiedRealPath);
      if (verifiedRealPath !== entry.realPath || !sameFile(opened, verified)) {
        throw new BrandPathError(`Brand file changed while it was being opened: ${entry.requestedPath}`);
      }

      return encoding ? readFileSync(fd, encoding) : readFileSync(fd);
    } catch (err) {
      if (err instanceof BrandPathError) throw err;
      throw new BrandPathError(`Could not safely read ${entry.requestedPath}: ${(err as Error).message}`);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  readDirectory(path: string): string[] {
    const entry = this.resolveExisting(path);
    if (!entry) return [];

    const noFollow = constants.O_NOFOLLOW ?? 0;
    const directory = constants.O_DIRECTORY ?? 0;
    let fd: number | undefined;
    try {
      fd = openSync(entry.realPath, constants.O_RDONLY | noFollow | directory);
      const opened = fstatSync(fd);
      if (!opened.isDirectory()) {
        throw new BrandPathError(`Brand input is not a directory: ${entry.requestedPath}`);
      }
      const entries = readdirSync(entry.realPath);
      const verifiedRealPath = realpathSync.native(entry.requestedPath);
      this.assertCanonicalContainment(verifiedRealPath);
      const verified = statSync(verifiedRealPath);
      if (verifiedRealPath !== entry.realPath || !sameFile(opened, verified)) {
        throw new BrandPathError(`Brand directory changed while it was being read: ${entry.requestedPath}`);
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

    let realPath: string;
    try {
      realPath = realpathSync.native(requestedPath);
    } catch (err) {
      throw new BrandPathError(`Could not resolve brand path ${requestedPath}: ${(err as Error).message}`);
    }
    this.assertCanonicalContainment(realPath);
    return { requestedPath, realPath };
  }

  private assertCanonicalContainment(realPath: string): void {
    if (!isWithin(this.realRoot, realPath)) {
      throw new BrandPathError('Brand path resolves outside configured root');
    }
  }
}
