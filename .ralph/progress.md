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

## 2026-08-28 23:24 EDT — SEC-001

- Objective: Make every local network entry point bind to loopback by default and honor explicit configuration.
- Defect reproduced: HTTP, SSE, preview, and standalone used hostless `listen` calls, while CLI defaults masked configured transport and ports.
- Changes: Defaulted network hosts to `127.0.0.1`; plumbed host through server, preview, CLI, and standalone; honored configured transport and ports; accepted `http` in config; formatted IPv6 URLs safely.
- Files changed: `src/types/config.ts`, `src/network.ts`, `src/index.ts`, `src/cli/index.ts`, `src/cli/commands/preview.ts`, `src/adapters/standalone.ts`, and binding/config tests.
- Tests added: Default and configured binding tests for Streamable HTTP, SSE, preview, and standalone.
- Verification commands: Focused 16 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`.
- Verification results: Focused tests pass; full 199 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Default network exposure is now restricted to loopback. Explicit non-loopback configuration remains intentionally possible and is gated by SEC-002.
- Compatibility review: Stdio remains the config default; CLI flags remain available and now override rather than mask config.
- Remaining risks: Non-loopback authentication, Host/Origin validation, and write-tool gating remain open.
- Rollback: Revert this story commit to restore prior binding behavior.
- Commit: Pending at time of entry.
- Next eligible story: SEC-002.

## 2026-08-28 23:29 EDT — SEC-002

- Objective: Require authentication whenever MCP network transports bind beyond loopback.
- Defect reproduced: Non-loopback SSE, Streamable HTTP, and standalone endpoints accepted unauthenticated requests.
- Changes: Added shared loopback detection and Bearer-token policy, SHA-256 digest comparison with `timingSafeEqual`, startup refusal without a usable token, HTTP middleware, standalone enforcement, safe error logging, and operator documentation.
- Files changed: `src/network.ts`, `src/index.ts`, `src/adapters/standalone.ts`, `README.md`, `src/tests/network-auth.test.ts`.
- Tests added: Loopback classification, token parsing, environment token, non-loopback startup refusal, HTTP and SSE 401 behavior, standalone enforcement, and credential log leakage.
- Verification commands: Focused 7 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`.
- Verification results: Focused tests pass; full 206 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Non-loopback MCP startup now fails closed without a token; credentials are never emitted in request-error logs.
- Compatibility review: Loopback development and stdio remain unauthenticated and compatible.
- Remaining risks: Host/Origin validation and write-tool gating remain open.
- Rollback: Revert this story commit; remove `BRANDKIT_AUTH_TOKEN` from deployment configuration if no longer used.
- Commit: Pending at time of entry.
- Next eligible story: SEC-003.

## 2026-08-28 23:37 EDT — SEC-003

- Objective: Reject DNS-rebinding and hostile browser authority headers consistently.
- Defect reproduced: Network transports accepted arbitrary Host and Origin values and left SDK rebinding protection disabled.
- Changes: Added shared normalized Host/Origin policy, explicit `allowedHosts` and `allowedOrigins`, wildcard fail-closed startup, duplicate-header rejection, outer validation on every endpoint, and SDK rebinding options.
- Files changed: `src/network.ts`, `src/types/config.ts`, `src/index.ts`, `src/adapters/standalone.ts`, `README.md`, and network/config tests.
- Tests added: IPv4/IPv6 loopback, wildcard and concrete hosts, exact origins, missing/malformed/duplicate headers, and hostile HTTP/SSE/standalone requests.
- Verification commands: Focused 23 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`.
- Verification results: Focused tests pass; full 214 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Request authority is validated before authentication, and wildcard binds cannot start without explicit public host trust.
- Compatibility review: Loopback clients retain automatic safe Host/Origin trust, including ephemeral ports.
- Remaining risks: Network write tools remain visible until SEC-004.
- Rollback: Revert this story commit and remove the new allowlist fields from configuration.
- Commit: Pending at time of entry.
- Next eligible story: SEC-004.

## 2026-08-28 23:43 EDT — SEC-004

- Objective: Remove write-capable tools from network surfaces unless explicitly privileged.
- Defect reproduced: `sync_brand_docs` was advertised and dispatched on network servers whenever a writable configuration context existed.
- Changes: Added an explicit tool-registration policy; kept stdio writable; made SSE, Streamable HTTP, standalone, and context-free Vercel registration read-only by default; added CLI and programmatic privileged opt-in; aligned overview metadata and documentation.
- Files changed: `README.md`, `src/tools/index.ts`, `src/tools/get-brand-overview.ts`, `src/index.ts`, `src/cli/index.ts`, `src/adapters/standalone.ts`, and tool/adapter tests.
- Tests added: Tool listing and direct-dispatch refusal, privilege-plus-context requirements, transport policy, standalone handshakes, and context-free Vercel behavior.
- Verification commands: Focused 12 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, CLI help inspection, and `git diff --check`.
- Verification results: Focused tests pass; full 221 tests pass; typecheck, lint, build, CLI help, and diff check pass.
- Security review: Both tool discovery and direct invocation are gated; merely knowing the tool name does not bypass the policy.
- Compatibility review: The local stdio workflow retains `sync_brand_docs`; network users must opt into privileged mode explicitly.
- Remaining risks: Streamable HTTP still reuses a stateless transport and fails after its first request.
- Rollback: Revert this story commit and remove the privileged CLI flag from deployment commands.
- Commit: Pending at time of entry.
- Next eligible story: HTTP-001.
