import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const tempDirs: string[] = [];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
  scripts: { build: string };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

function runBuild(tsupExitCode: number, chmodExitCode: number) {
  const testDir = mkdtempSync(join(tmpdir(), 'brandkit-build-contract-'));
  tempDirs.push(testDir);
  const binDir = join(testDir, 'bin');
  const chmodMarker = join(testDir, 'chmod-ran');

  mkdirSync(binDir);
  writeFileSync(
    join(testDir, 'package.json'),
    JSON.stringify({ private: true, scripts: { build: packageJson.scripts.build } }),
  );
  writeExecutable(join(binDir, 'tsup'), `exit ${tsupExitCode}`);
  writeExecutable(
    join(binDir, 'chmod'),
    `: > ${JSON.stringify(chmodMarker)}\nexit ${chmodExitCode}`,
  );

  const result = spawnSync('npm', ['run', 'build'], {
    cwd: testDir,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
  });

  return { ...result, chmodMarker };
}

describe('package build command', () => {
  it('fails npm run build when tsup fails', () => {
    const result = runBuild(23, 0);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(23);
    expect(() => readFileSync(result.chmodMarker)).toThrow();
  });

  it('keeps the optional chmod step non-fatal', () => {
    const result = runBuild(0, 17);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(readFileSync(result.chmodMarker, 'utf-8')).toBe('');
  });
});
