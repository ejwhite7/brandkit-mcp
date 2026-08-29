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

## 2026-08-28 23:54 EDT — HTTP-001

- Objective: Make stateless Streamable HTTP reliable across sequential and concurrent requests.
- Defect reproduced: A single stateless SDK transport was reused for every `/mcp` request, which the SDK rejects after its first request.
- Changes: Added a shared MCP server factory; create a fresh Server and stateless transport for every POST; close each owned pair idempotently on response close; return structured JSON-RPC parse/internal errors; return an explicit structured 405 for stateless GET and DELETE in line with the SDK reference server.
- Files changed: `src/index.ts`, `src/tests/streamable-http.test.ts`.
- Tests added: Real SDK client initialize, ping, repeated tool listing, simultaneous client isolation, Server/transport close spies, malformed JSON, injected handler failure, and unsupported method responses.
- Verification commands: Focused 5 tests, focused HTTP/security 28 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused and security tests pass; full 226 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Every request retains authentication, Host/Origin validation, and the network write-tool policy before an MCP server is created.
- Compatibility review: Stdio and SSE behavior are unchanged. Stateless HTTP is POST-only; the former GET/DELETE paths could not provide useful cross-request state with a fresh transport.
- Remaining risks: HTTP health, request size, timeouts, and normalized operational errors remain for HTTP-002.
- Rollback: Revert this story commit to restore the former HTTP handler, noting that doing so restores the second-request failure.
- Commit: Pending at time of entry.
- Next eligible story: HTTP-002.

## 2026-08-29 00:01 EDT — HTTP-002

- Objective: Bound network resources and make readiness and failure behavior predictable.
- Defect reproduced: Main HTTP/SSE lacked readiness, request/session caps, and application timeouts; standalone exposed indexed asset counts and buffered message bodies without an explicit limit; several post-header errors could leave responses open.
- Changes: Added shared finite network limits; authenticated and authority-protected `{status: "ready"}` health responses with no brand data; bounded JSON bodies, concurrent requests, and SSE sessions; finite request/header/keep-alive/header-count settings; structured redacted 400/413/500/503/504 responses; session Server cleanup and timeout cancellation.
- Files changed: `src/network.ts`, `src/index.ts`, `src/adapters/standalone.ts`, `src/tests/streamable-http.test.ts`, `src/tests/standalone-adapter.test.ts`.
- Tests added: Readiness response/redaction, concrete server limits, oversized Express and standalone bodies, SSE session capacity, concurrent request capacity, stuck-handler timeout, and retained HTTP-001 client/cleanup coverage.
- Verification commands: Focused 28 network tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 230 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Requests, bodies, headers, and sessions have finite caps; external error payloads do not expose stack traces, credentials, filesystem paths, or brand counts.
- Compatibility review: Stdio is unchanged; SSE remains long-lived because socket limits do not impose a response lifetime; HTTP-001 cleanup remains response-owned on successful requests.
- Remaining risks: Brand file reads still need universal symlink containment in FS-001.
- Rollback: Revert this story commit; custom `networkLimits` embedder options will no longer be accepted.
- Commit: Pending at time of entry.
- Next eligible story: FS-001.

## 2026-08-29 00:10 EDT — FS-001

- Objective: Prevent every brand-input read from escaping `brand.root`.
- Defect reproduced: Recursive discovery had a partial canonical-path check, while fixed markdown/YAML/CSS/motion reads and parser APIs followed arbitrary outside-root symlinks.
- Changes: Added a per-scan `BrandReadPolicy` with lexical and canonical containment, safe in-root symlink support, redacted rejection errors, `O_NOFOLLOW` canonical opens, regular-file/directory checks, and inode/device revalidation; routed scanner and every file-reading parser through it; made Sharp consume validated buffers; rejected manifest traversal.
- Files changed: `README.md`, `src/filesystem/brand-read-policy.ts`, scanner, seven parser modules, six parser tests, and `src/tests/filesystem-containment.test.ts`.
- Tests added: Outside symlinks for all fixed and discovered inputs; parent/discovered directory escapes; index/tool/resource non-leakage including path redaction; image encoding containment; manifest traversal; valid in-root symlinks.
- Verification commands: Focused 44 and 68-test parser/containment runs, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 235 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Outside content and canonical target paths do not enter indexes, tools, resources, previews, or warnings; no global mutable root policy is used.
- Compatibility review: Valid files and symlinks whose final targets remain within the configured root continue to work.
- Remaining risks: In-root directory symlink cycles and ignore-boundary semantics remain for FS-002.
- Rollback: Revert this story commit; parser callers would return to path-only signatures.
- Commit: Pending at time of entry.
- Next eligible story: FS-002.

## 2026-08-29 00:15 EDT — FS-002

- Objective: Make recursive discovery cycle-safe and make ignore behavior precise.
- Defect reproduced: In-root directory symlink cycles could recurse indefinitely, and ignore paths were evaluated relative to individual visual directories with raw prefix matching.
- Changes: Added contained canonical directory identities, per-walk visited sets, and sorted traversal; compile normalized ignore rules once against `brand.root`; apply them to fixed and discovered inputs across base/web/product; reject absolute, root-escaping, empty, and NUL patterns; match only exact paths or descendant boundaries.
- Files changed: `README.md`, `src/filesystem/brand-read-policy.ts`, `src/scanner/directory-scanner.ts`, `src/tests/scanner.test.ts`.
- Tests added: Self, ancestor, and mutual cycles; duplicate aliases and determinism; slash/dot normalization; invalid patterns; `human` versus `humanity`; context-specific ignore isolation.
- Verification commands: Focused 16 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 238 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Canonical identities are only internal traversal keys; FS-001 containment still rejects outside aliases before traversal.
- Compatibility review: Valid in-root aliases work, traversal order is deterministic, and documented ignore entries now have stable brand-root-relative meaning.
- Remaining risks: Output writes can still follow symlinks until FS-003.
- Rollback: Revert this story commit; remove brand-root-relative ignore entries added under the documented contract.
- Commit: Pending at time of entry.
- Next eligible story: FS-003.

## 2026-08-29 00:54 EDT — FS-003

- Objective: Make generated-document writes atomic and prevent indirect writes to protected targets.
- Defect reproduced: Existing `DESIGN.md` and `PRODUCT.md` symlinks were followed by direct writes during startup, CLI docs, and `sync_brand_docs`.
- Changes: Added a shared atomic writer using restrictive same-directory temporary files, safe existing-file reads, fsync, permission preservation, and rename; reject symlink, hard-linked, non-regular, and unsafe output-directory entries; preflight both brand docs; clean staged files; return a structured sync `write_failed` result.
- Files changed: `src/brand-docs/write.ts`, `src/tools/sync-brand-docs.ts`, and brand-doc/startup/CLI/sync tests.
- Tests added: Atomic inode replacement and mode preservation; relative and absolute output symlinks; hard links; non-regular outputs; symlink output directories; pair preflight/cleanup; startup, CLI, and sync protected-target workflows.
- Verification commands: Focused 34 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 246 tests pass; typecheck, lint, build, and diff check pass.
- Security review: `magic_trick.md` and external targets remain byte-for-byte unchanged; final output paths are never opened for writing and rename replaces any post-check symlink rather than following it.
- Compatibility review: Existing regular-file permissions and human content outside delimiters are preserved; new files begin with restrictive permissions.
- Newly discovered: FS-005 records that config persistence in `sync_brand_docs` still follows a post-startup config symlink. It is a separate failing story and was not hidden in this checkpoint.
- Remaining risks: FS-005 config persistence and FS-004 delimiter parsing remain open.
- Rollback: Revert this story commit; generated files would return to direct non-atomic writes.
- Commit: Pending at time of entry.
- Next eligible story: FS-005.
