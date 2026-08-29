# BrandKit MCP remediation progress

Append-only execution record. A story is complete only when its acceptance
criteria and the global regression gate have objective evidence here.

## 2026-08-28 23:15 EDT — BASE-001

- Objective: Capture a reproducible remediation baseline and persist the Ralph controller state.
- Defect reproduced: The existing production dependency audit exits nonzero with 11 findings: 6 high, 4 moderate, and 1 low. A full install reports 17 findings including 1 critical development advisory.
- Changes: Added the authoritative remediation PRD, loop prompt, append-only progress log, failure log, and discovered-bug registry.
- Files changed: `.ralph/PROMPT.md`, `.ralph/remediation-prd.json`, `.ralph/progress.md`, `.ralph/failures.md`, `.ralph/discovered-bugs.json`.
- Verification commands: `jq empty`, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm audit --omit=dev --json`, `npm pack --dry-run --json`, `git diff --check`.
- Verification results: JSON valid; install, typecheck, lint, 190 tests, build, package dry run, and diff check pass. Audit failure is captured by DEP-002 and is not waived.
- Security review: All original critical and high review findings are represented as failing stories.
- Compatibility review: No runtime source or public behavior changed.
- Remaining risks: All implementation stories remain open.
- Rollback: Revert the baseline-state commit; runtime behavior is unaffected.
- Commit: Pending at time of entry.
- Next eligible story: BASE-002.

## 2026-08-28 23:17 EDT — BASE-002

- Objective: Ensure a failed TypeScript bundle makes the build and release pipeline fail.
- Defect reproduced: The prior `tsup && chmod ... || true` command returned success when `tsup` failed.
- Changes: Grouped the non-fatal fallback around `chmod` only and added a contract test that executes the actual package build script with controlled fake binaries.
- Files changed: `package.json`, `src/tests/build-command.test.ts`.
- Tests added: Build returns the `tsup` failure code and does not run `chmod`; failed optional `chmod` leaves a successful build successful.
- Verification commands: Focused Vitest file, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`.
- Verification results: Focused 2 tests pass; full 192 tests pass; typecheck, lint, production build, and diff check pass.
- Security review: Release automation can no longer publish stale output after a masked bundler failure.
- Compatibility review: Successful build behavior and optional executable-bit fallback are unchanged.
- Remaining risks: Network, filesystem, context, dependency, and deployment stories remain open.
- Rollback: Restore the previous package script and remove the contract test.
- Commit: Pending at time of entry.
- Next eligible story: SEC-001.
