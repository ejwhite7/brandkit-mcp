/**
 * @file brand-docs/write.ts
 * @description Symlink-safe, atomic writes for generated documents.
 */

import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'fs';
import { randomUUID } from 'crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';

export const DELIMITER_START = '<!-- brandkit-mcp:start -->';
export const DELIMITER_END = '<!-- brandkit-mcp:end -->';

export class GeneratedWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedWriteError';
  }
}

interface PreparedWrite {
  targetPath: string;
  tempPath: string;
  directoryPath: string;
  directoryIdentity: Pick<Stats, 'dev' | 'ino'>;
  tempIdentity: Pick<Stats, 'dev' | 'ino'>;
}

function sameFile(
  left: Pick<Stats, 'dev' | 'ino'>,
  right: Pick<Stats, 'dev' | 'ino'>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function inspectOutputDirectory(outputDir: string): { path: string; identity: Stats } {
  const requested = resolve(outputDir);
  let requestedEntry: Stats;
  try {
    requestedEntry = lstatSync(requested);
  } catch (err) {
    throw new GeneratedWriteError(`Could not inspect output directory: ${(err as Error).message}`);
  }
  if (requestedEntry.isSymbolicLink()) {
    throw new GeneratedWriteError('Refusing to use a symbolic link as the output directory');
  }
  if (!requestedEntry.isDirectory()) {
    throw new GeneratedWriteError('Refusing to use a non-directory output path');
  }

  const canonical = realpathSync.native(requested);
  const identity = lstatSync(canonical);
  if (!identity.isDirectory() || identity.isSymbolicLink()) {
    throw new GeneratedWriteError('Output directory is not a regular directory');
  }
  return { path: canonical, identity };
}

function assertDirectoryUnchanged(path: string, expected: Pick<Stats, 'dev' | 'ino'>): void {
  let current: Stats;
  try {
    if (realpathSync.native(path) !== path) {
      throw new GeneratedWriteError('Output directory changed into a symbolic link during write');
    }
    current = lstatSync(path);
  } catch (err) {
    if (err instanceof GeneratedWriteError) throw err;
    throw new GeneratedWriteError(`Output directory changed during write: ${(err as Error).message}`);
  }
  if (!current.isDirectory() || current.isSymbolicLink() || !sameFile(current, expected)) {
    throw new GeneratedWriteError('Output directory changed during write');
  }
}

function inspectTarget(targetPath: string): Stats | undefined {
  try {
    const entry = lstatSync(targetPath);
    if (entry.isSymbolicLink()) {
      throw new GeneratedWriteError(`Refusing to replace symbolic-link output ${basename(targetPath)}`);
    }
    if (!entry.isFile()) {
      throw new GeneratedWriteError(`Refusing to replace non-regular output ${basename(targetPath)}`);
    }
    if (entry.nlink > 1) {
      throw new GeneratedWriteError(`Refusing to replace hard-linked output ${basename(targetPath)}`);
    }
    return entry;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (err instanceof GeneratedWriteError) throw err;
    throw new GeneratedWriteError(`Could not inspect output ${basename(targetPath)}: ${(err as Error).message}`);
  }
}

function readExistingFile(targetPath: string, expected: Stats): string {
  let fd: number | undefined;
  try {
    fd = openSync(targetPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || !sameFile(opened, expected)) {
      throw new GeneratedWriteError(`Output ${basename(targetPath)} changed while being read`);
    }
    return readFileSync(fd, 'utf-8');
  } catch (err) {
    if (err instanceof GeneratedWriteError) throw err;
    throw new GeneratedWriteError(`Could not safely read output ${basename(targetPath)}: ${(err as Error).message}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function prepareAtomicWrite(
  directoryPath: string,
  directoryIdentity: Stats,
  targetPath: string,
  content: string,
  existing: Stats | undefined,
): PreparedWrite {
  assertDirectoryUnchanged(directoryPath, directoryIdentity);
  const tempPath = join(
    directoryPath,
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let fd: number | undefined;
  try {
    fd = openSync(
      tempPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(fd, content, 'utf-8');
    if (existing) fchmodSync(fd, existing.mode & 0o777);
    fsyncSync(fd);
    const tempIdentity = fstatSync(fd);
    return { targetPath, tempPath, directoryPath, directoryIdentity, tempIdentity };
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw new GeneratedWriteError(`Could not stage atomic output ${basename(targetPath)}: ${(err as Error).message}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function commitPreparedWrite(prepared: PreparedWrite): void {
  assertDirectoryUnchanged(prepared.directoryPath, prepared.directoryIdentity);
  const tempEntry = lstatSync(prepared.tempPath);
  if (!tempEntry.isFile() || tempEntry.isSymbolicLink() || !sameFile(tempEntry, prepared.tempIdentity)) {
    throw new GeneratedWriteError(`Temporary output for ${basename(prepared.targetPath)} changed before commit`);
  }
  renameSync(prepared.tempPath, prepared.targetPath);
}

function cleanupPreparedWrite(prepared: PreparedWrite): void {
  try {
    unlinkSync(prepared.tempPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Cleanup is best-effort; retain the primary write error.
    }
  }
}

/** Atomically replace a regular file without ever following the final path. */
export function atomicWriteFile(filePath: string, content: string): void {
  const directory = inspectOutputDirectory(dirname(filePath));
  const targetPath = resolve(directory.path, basename(filePath));
  if (!isWithin(directory.path, targetPath)) {
    throw new GeneratedWriteError('Generated output is outside the output directory');
  }
  const existing = inspectTarget(targetPath);
  const prepared = prepareAtomicWrite(directory.path, directory.identity, targetPath, content, existing);
  try {
    commitPreparedWrite(prepared);
  } finally {
    cleanupPreparedWrite(prepared);
  }
}

function renderDelimitedFile(existing: string | undefined, generatedBlock: string): string {
  const wrappedBlock = `${DELIMITER_START}\n${generatedBlock}\n${DELIMITER_END}`;
  if (existing === undefined) return wrappedBlock + '\n';

  const startIdx = existing.indexOf(DELIMITER_START);
  const endIdx = existing.indexOf(DELIMITER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return (
      existing.slice(0, startIdx) +
      wrappedBlock +
      existing.slice(endIdx + DELIMITER_END.length)
    );
  }
  return existing.trimEnd() + '\n\n' + wrappedBlock + '\n';
}

/** Write a generated block while preserving content outside the delimiters. */
export function updateFileWithDelimiters(filePath: string, generatedBlock: string): void {
  const directory = inspectOutputDirectory(dirname(filePath));
  const targetPath = resolve(directory.path, basename(filePath));
  if (!isWithin(directory.path, targetPath)) {
    throw new GeneratedWriteError('Generated output is outside the output directory');
  }
  const existing = inspectTarget(targetPath);
  const existingText = existing ? readExistingFile(targetPath, existing) : undefined;
  const prepared = prepareAtomicWrite(
    directory.path,
    directory.identity,
    targetPath,
    renderDelimitedFile(existingText, generatedBlock),
    existing,
  );
  try {
    commitPreparedWrite(prepared);
  } finally {
    cleanupPreparedWrite(prepared);
  }
}

/** Writes DESIGN.md and PRODUCT.md. Both destinations are validated before either is changed. */
export function writeBrandDocs(
  outputDir: string,
  docs: { design: string; product: string },
): { designPath: string; productPath: string } {
  const requestedOutputDir = resolve(outputDir);
  const directory = inspectOutputDirectory(outputDir);
  const specs = [
    { targetPath: join(directory.path, 'DESIGN.md'), block: docs.design },
    { targetPath: join(directory.path, 'PRODUCT.md'), block: docs.product },
  ];
  const prepared: PreparedWrite[] = [];
  try {
    // Stage both files first. Known unsafe destinations therefore fail before
    // either document is committed.
    for (const spec of specs) {
      if (!isWithin(directory.path, spec.targetPath)) {
        throw new GeneratedWriteError('Generated output is outside the output directory');
      }
      const existing = inspectTarget(spec.targetPath);
      const existingText = existing ? readExistingFile(spec.targetPath, existing) : undefined;
      prepared.push(
        prepareAtomicWrite(
          directory.path,
          directory.identity,
          spec.targetPath,
          renderDelimitedFile(existingText, spec.block),
          existing,
        ),
      );
    }

    let committed = 0;
    try {
      for (const item of prepared) {
        commitPreparedWrite(item);
        committed += 1;
      }
    } catch (err) {
      throw new GeneratedWriteError(
        `Brand document commit failed after ${committed} of ${prepared.length} files; ` +
          `each completed file is intact and any remaining file is unchanged: ${(err as Error).message}`,
      );
    }
  } finally {
    for (const item of prepared) cleanupPreparedWrite(item);
  }

  // Preserve the caller-facing path spelling even when a system ancestor
  // (for example macOS /var) canonicalizes differently internally.
  return {
    designPath: join(requestedOutputDir, 'DESIGN.md'),
    productPath: join(requestedOutputDir, 'PRODUCT.md'),
  };
}
