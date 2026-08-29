#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const identifier = '[0-9A-Za-z-]+';
const numericIdentifier = '(?:0|[1-9][0-9]*)';
const prereleaseIdentifier = `(?:${numericIdentifier}|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)`;
const STRICT_SEMVER = new RegExp(
  `^${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}`
  + `(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?`
  + `(?:\\+${identifier}(?:\\.${identifier})*)?$`,
);

export function resolvePublishVersion({ eventName, manualVersion, ref }) {
  let version;

  if (eventName === 'workflow_dispatch') {
    version = manualVersion;
  } else if (eventName === 'push' && ref.startsWith('refs/tags/v')) {
    version = ref.slice('refs/tags/v'.length);
  } else {
    throw new Error('Publish requires a manual dispatch or a v-prefixed tag');
  }

  if (!STRICT_SEMVER.test(version)) {
    throw new Error('Publish version must be a strict SemVer value without a leading v');
  }

  return version;
}

function main() {
  try {
    const version = resolvePublishVersion({
      eventName: process.env.GITHUB_EVENT_NAME ?? '',
      manualVersion: process.env.RELEASE_INPUT_VERSION ?? '',
      ref: process.env.GITHUB_REF ?? '',
    });
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!outputPath) {
      throw new Error('GITHUB_OUTPUT is not available');
    }

    appendFileSync(outputPath, `version=${version}\n`, { encoding: 'utf8' });
    console.log(`Publishing version: ${version}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid publish version';
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
