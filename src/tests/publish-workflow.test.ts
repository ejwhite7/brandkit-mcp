import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = resolve(root, '.github/workflows/publish.yml');

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface PublishWorkflow {
  jobs: {
    publish: {
      steps: WorkflowStep[];
    };
  };
}

const temporaryDirectories: string[] = [];

function readWorkflow(): PublishWorkflow {
  return yaml.load(readFileSync(workflowPath, 'utf8')) as PublishWorkflow;
}

function runResolver(environment: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'brandkit-publish-test-'));
  temporaryDirectories.push(directory);
  const output = join(directory, 'github-output');
  const workflow = readWorkflow();
  const step = workflow.jobs.publish.steps.find(({ name }) => name === 'Resolve target version');

  if (!step?.run) {
    throw new Error('Resolve target version step is missing');
  }

  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', step.run], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: output,
      ...environment,
    },
  });

  return {
    ...result,
    output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    directory,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('publish workflow input safety', () => {
  it('passes every GitHub expression into shell steps through env only', () => {
    const workflow = readWorkflow();
    const steps = workflow.jobs.publish.steps;

    for (const step of steps) {
      expect(step.run ?? '', `${step.name ?? 'unnamed step'} interpolates an expression in run`)
        .not.toMatch(/\$\{\{/);
    }

    expect(steps.find(({ name }) => name === 'Resolve target version')?.env).toMatchObject({
      RELEASE_INPUT_VERSION: '${{ inputs.version }}',
    });
    expect(steps.find(({ name }) => name === 'Sync version into package.json and server.json')?.env)
      .toMatchObject({ RELEASE_VERSION: '${{ steps.ver.outputs.version }}' });
    expect(steps.find(({ name }) => name === 'Summary')?.env)
      .toMatchObject({ RELEASE_VERSION: '${{ steps.ver.outputs.version }}' });
  });

  it.each([
    '1.2.3',
    '0.0.0-alpha.1',
    '12.34.56-rc.1+build.20260829',
  ])('accepts strict manual SemVer %s', (version) => {
    const result = runResolver({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      RELEASE_INPUT_VERSION: version,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe(`version=${version}\n`);
  });

  it('preserves v-prefixed tag releases while emitting an unprefixed package version', () => {
    const result = runResolver({
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/tags/v2.1.0',
      RELEASE_INPUT_VERSION: '',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe('version=2.1.0\n');
  });

  it('synchronizes the resolved version across npm and MCP Registry metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'brandkit-publish-sync-test-'));
    temporaryDirectories.push(directory);
    copyFileSync(resolve(root, 'package.json'), join(directory, 'package.json'));
    copyFileSync(resolve(root, 'server.json'), join(directory, 'server.json'));
    const step = readWorkflow().jobs.publish.steps
      .find(({ name }) => name === 'Sync version into package.json and server.json');

    if (!step?.run) {
      throw new Error('Version synchronization step is missing');
    }

    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', step.run], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, RELEASE_VERSION: '3.4.5-rc.1' },
    });
    const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
      version: string;
    };
    const server = JSON.parse(readFileSync(join(directory, 'server.json'), 'utf8')) as {
      version: string;
      packages: Array<{ identifier: string; version: string }>;
    };

    expect(result.status, result.stderr).toBe(0);
    expect(pkg.version).toBe('3.4.5-rc.1');
    expect(server.version).toBe('3.4.5-rc.1');
    expect(server.packages.find(({ identifier }) => identifier === 'brandkit-mcp')?.version)
      .toBe('3.4.5-rc.1');
  });

  it.each([
    '',
    'v1.2.3',
    '01.2.3',
    '1.02.3',
    '1.2',
    '1.2.3-01',
    '1.2.3 ',
  ])('rejects non-strict manual version %j', (version) => {
    const result = runResolver({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      RELEASE_INPUT_VERSION: version,
    });

    expect(result.status).not.toBe(0);
    expect(result.output).toBe('');
    expect(result.stderr).toContain('strict SemVer');
  });

  it.each([
    '$(touch INJECTED)',
    '`touch INJECTED`',
    '1.2.3; touch INJECTED',
    '1.2.3\nversion=9.9.9',
    '1.2.3"; touch INJECTED; #',
  ])('keeps hostile input as inert data: %j', (version) => {
    const result = runResolver({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      RELEASE_INPUT_VERSION: version,
    });

    expect(result.status).not.toBe(0);
    expect(result.output).toBe('');
    expect(existsSync(resolve(root, 'INJECTED'))).toBe(false);
    expect(existsSync(join(result.directory, 'INJECTED'))).toBe(false);
  });

  it('pins and verifies the official mcp-publisher archive before extraction', () => {
    const step = readWorkflow().jobs.publish.steps
      .find(({ name }) => name === 'Install mcp-publisher');

    expect(step?.env).toEqual({
      MCP_PUBLISHER_VERSION: '1.7.9',
      MCP_PUBLISHER_LINUX_AMD64_SHA256:
        'ab128162b0616090b47cf245afe0a23f3ef08936fdce19074f5ba0a4469281ac',
      MCP_PUBLISHER_LINUX_ARM64_SHA256:
        '04f5199b3deef8e6fc4d6ed98c56a74f799def53edca3fe6d4862ecd4397c172',
    });

    const installer = step?.run ?? '';
    expect(installer).toContain('/releases/download/v${MCP_PUBLISHER_VERSION}/$asset');
    expect(installer).not.toMatch(/releases\/latest|curl[^\n]*\|\s*tar/);
    expect(installer).toContain('Linux:x86_64)');
    expect(installer).toContain('Linux:aarch64)');
    expect(installer).toMatch(/\*\)[\s\S]*exit 1/);

    const verification = installer.indexOf('sha256sum --check --strict');
    const extraction = installer.indexOf('tar --extract');
    const executionPermission = installer.indexOf('chmod +x');
    expect(verification).toBeGreaterThan(-1);
    expect(extraction).toBeGreaterThan(verification);
    expect(executionPermission).toBeGreaterThan(extraction);
  });

  it('pins every external action in every workflow to a full commit SHA', () => {
    const workflowDirectory = resolve(root, '.github/workflows');
    const mutableReferences: string[] = [];

    for (const filename of readdirSync(workflowDirectory)) {
      if (!/\.ya?ml$/.test(filename)) continue;
      const source = readFileSync(resolve(workflowDirectory, filename), 'utf8');

      for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
        const action = match[1];
        if (action.startsWith('./') || action.startsWith('docker://')) continue;
        if (!/@[a-f0-9]{40}$/.test(action)) {
          mutableReferences.push(`${filename}: ${action}`);
        }
      }
    }

    expect(mutableReferences).toEqual([]);
  });
});
