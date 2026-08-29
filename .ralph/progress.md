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

## 2026-08-29 01:01 EDT — FS-005

- Objective: Prevent `sync_brand_docs` config reads and persistence from being redirected after startup.
- Defect reproduced: Replacing `brandkit.config.yaml` with a symlink after server startup redirected both YAML reads and direct writes and could overwrite a valid-v2 `magic_trick.md` or external file.
- Changes: Added safe single-link regular-file reads with `O_NOFOLLOW`, descriptor identity checks, and optional trusted identity; config loader captures startup identity; sync uses identity-bound reads and FS-003 atomic writes; one shared mutable context carries new identities across fresh HTTP/SSE Server instances; startup rejects symlink, hard-linked, and non-regular configs.
- Files changed: `README.md`, config loader, atomic writer, startServer/standalone registration, tool registry/sync handler, and config/tool/sync tests.
- Tests added: Unsafe config types at startup; post-registration relative/absolute symlinks, hard links, directories, and regular replacement; protected-byte and warning redaction checks; permissions and inode replacement; two successful saves across fresh tool registrations.
- Verification commands: Focused 35 and 51-test runs, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 252 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Redirected content is not parsed or echoed, final config paths are never opened for writing, and protected targets remain unchanged.
- Compatibility review: Regular configs retain their permissions and can be saved repeatedly; replacement of the trusted config while running intentionally fails closed with `savedConfig: false`.
- Discovered-bug status: FS-005 resolved with regression evidence.
- Remaining risks: Generated delimiter injection remains for FS-004.
- Rollback: Revert this story commit; config symlink protection and startup identity binding would be removed.
- Commit: Pending at time of entry.
- Next eligible story: FS-004.

## 2026-08-29 01:06 EDT — FS-004

- Objective: Make managed generated blocks unambiguous and repeatable under hostile content.
- Defect reproduced: Brand and brief text could inject an end marker, causing later runs to replace only a prefix and leave stale generated content outside the managed block.
- Changes: Reject reserved markers in generated blocks; accept existing files only with zero markers or exactly one ordered pair; reject mismatched, reversed, duplicate, nested, and multiple pairs before staging; preflight both brand docs; preserve zero-marker human bytes without `trimEnd` mutation.
- Files changed: `src/brand-docs/write.ts`, `src/tests/brand-docs.test.ts`.
- Tests added: Every brief field, representative verbal/audience/color/font/component/motion atoms, all five generated filenames, malformed topology table, two-file preflight, no-temp guarantees, trailing whitespace, and three-run byte idempotence.
- Verification commands: Focused 65 tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 279 tests pass; typecheck, lint, build, and diff check pass.
- Security review: Reserved source text cannot become structural control markers; ambiguous existing files remain byte-for-byte unchanged.
- Compatibility review: Valid single managed blocks update normally, human prefixes/suffixes are preserved exactly, and caller-facing output path spelling remains stable.
- Remaining risks: Context tools still need canonical merged-data consumption in CTX-001.
- Rollback: Revert this story commit; injected or ambiguous delimiters would again be interpreted heuristically.
- Commit: Pending at time of entry.
- Next eligible story: CTX-001.

## 2026-08-29 01:18 EDT — CTX-001

- Objective: Create one canonical merged context view and make every public consumer use it.
- Defect reproduced: A partial product/web override caused raw-bucket consumers to discard unrelated base components, tokens, assets, and fonts even though the resolver preserved them.
- Changes: Added `DesignSystemIndex.contexts` as the canonical merged raw-data record; materialize `resolved` from that record; share stable item identities between merging and diffs; route visual tools, search, preview, prompts, resources, docs, validation, CLI summaries, and server counts through the canonical view. Raw `base`/`web`/`product` scan layers remain for compatibility and diagnostics. Whole-file CSS and motion retain their documented override-or-fallback semantics.
- Files changed: Context resolver/index types and builder; visual/diff/search tools; preview server/template; prompts; brand-doc generation; CLI docs/validation; server logging; test helper; `src/tests/context-merge.test.ts`.
- Tests added: Partial replacement plus inheritance for components, tokens, assets, and fonts; case-normalized identity parity; CSS/motion fallback; tool/materialized/resource equivalence; inherited and replaced search behavior; replacement-aware diffs; preview rendering across all context asset routes.
- Verification commands: Focused 8 and 79-test runs, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, raw-access `rg` audit, and `git diff --check`.
- Verification results: Focused tests pass; full 35 files / 287 tests pass; typecheck, lint, build/declarations, raw-access audit, and diff check pass.
- Security review: Canonicalization does not add filesystem access or expand network authority; raw scan layers are retained but no production consumer bypasses containment or context resolution.
- Compatibility review: Existing whole-object CSS/motion behavior is unchanged; diff output gains additive changed/assets/fonts/motion sections; unfiltered search intentionally represents inherited entries in each resolved context.
- Remaining risks: The shipped Docker target still does not start the advertised network service; DOCKER-001 is next.
- Rollback: Revert this story commit; callers would return to raw override buckets and partial-override data loss.
- Commit: Pending at time of entry.
- Next eligible story: DOCKER-001.

## 2026-08-29 01:30 EDT — DOCKER-001

- Objective: Make the shipped image and Compose service healthy, authenticated, and MCP-capable.
- Defect reproduced: Compose published and health-checked port 3001 while the image defaulted to stdio, so no HTTP listener or `/health` endpoint existed; default bind mounts also referenced files absent from a fresh checkout.
- Changes: Build with lockfile-backed `npm ci`; run as the non-root Node user; bundle a Docker-specific Acme config/data set; explicitly start the main Streamable HTTP CLI on port 3001; require runtime bearer auth; publish the host port on loopback; authenticate the health check; remove failing default bind mounts and the unnecessary unauthenticated preview service; add a bounded SDK smoke client and Ubuntu Compose CI job with masked ephemeral credentials and guaranteed cleanup.
- Files changed: `Dockerfile`, `docker-compose.yml`, `docker/brandkit.config.yaml`, `scripts/docker-smoke.mjs`, `package.json`, `.github/workflows/ci.yml`, `README.md`, and `src/tests/docker-deployment.test.ts`.
- Tests added: Image/entrypoint/non-root contract; mandatory auth and health contract; wildcard Host allowlist config; CI initialize/tool-call smoke contract.
- Verification commands: Focused 26-test matrix, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, authenticated and missing-token `docker compose config --quiet`, real built-CLI HTTP health plus SDK smoke, Docker context audit, and `git diff --check`.
- Verification results: Focused tests pass; full 36 files / 291 tests pass; typecheck, lint, build, Compose config, real initialize/listTools/get_brand_overview, readiness, write-tool hiding, context audit, and diff check pass. Unauthenticated health returns 401 and authenticated health returns `{status:"ready"}`.
- Environment limitation: The local OrbStack Docker daemon was unresponsive and the bounded probe timed out, so local image build/up was not available. The new Ubuntu CI job performs the missing real container build, health wait, and MCP handshake.
- Security review: No credential is baked into the image or logged; Compose refuses a missing token; network write tools remain hidden; only the authenticated MCP service is shipped; the unauthenticated preview stays a trusted-local CLI.
- Compatibility review: The image default intentionally changes from stdio to authenticated HTTP to match its published port; stdio remains available through the documented command override. Custom brands mount their own regular config/data and set `BRANDKIT_CONFIG`.
- Remaining risks: Dependency reachability and vulnerability cleanup remain in DEP-001/DEP-002.
- Rollback: Revert this story commit; this restores the prior stdio default and broken Compose health/MCP path.
- Commit: Pending at time of entry.
- Next eligible story: DEP-001.

## 2026-08-29 01:40 EDT — DEP-001

- Objective: Remove unreachable runtime packages and parser code while preserving the shipped API and behavior.
- Defect reproduced: `marked`, `pdf-parse`, `sharp`, `chalk`, and `ora` were production dependencies without a path from either shipped entry point; image/PDF parsers and several legacy CSS/markdown helpers were reachable only from tests and were never exported or bundled.
- Changes: Removed the five dead runtime packages and orphaned `@types/pdf-parse`; deleted unreachable image/PDF parsers; removed legacy test-only CSS color/type helpers and markdown guideline/palette helpers; updated architecture docs; added an import-graph contract that requires exact direct-dependency parity and reachability for every retained parser.
- Files changed: `package.json`, `package-lock.json`, `CLAUDE.md`, parser modules, parser/containment tests, and `src/tests/dependency-reachability.test.ts`.
- Tests added: Static and dynamic import tracing from both shipped entry points; exact runtime dependency parity; every parser module must have a production path.
- Verification commands: Focused 47-test compatibility and 2-test reachability checks, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm ls --omit=dev --all`, clean copied-tree `npm ci` plus all gates, tarball dry run and empty-consumer install/import/CLI smoke, and `git diff --check`.
- Verification results: Full 37 files / 282 tests pass; typecheck, lint, build/DTS, production tree, clean install, consumer import, CLI version/help, and diff check pass. Published runtime exports remain `startServer` and `allowWriteToolsForTransport`.
- Package impact: Direct production dependencies 14 to 9; unique production tree names 183 to 135; installed tree 172,712 to 125,340 KiB; packed size 323,709 to 317,469 bytes (-1.93%); unpacked size 1,359,635 to 1,332,713 bytes (-1.98%).
- Security review: Removes the vulnerable and native Sharp/libvips surface and unused PDF parser; no replacement parser or new input path was added.
- Compatibility review: Deleted source helpers were absent from package exports, declarations, and tarballs; canonical color/type extraction remains in the context resolver; supported scanner/tool behavior is unchanged.
- Remaining risks: Reachable dependency advisories and CI audit enforcement remain in DEP-002.
- Rollback: Revert this story commit and reinstall; that restores unused packages and unshipped parser source only.
- Commit: Pending at time of entry.
- Next eligible story: DEP-002.

## 2026-08-29 01:48 EDT — DEP-002

- Objective: Eliminate reachable production and development advisories and make audit failure a release blocker.
- Defect reproduced: `npm audit --omit=dev` reported 10 production findings (5 high, 4 moderate, 1 low), while the full graph reported 16 (1 critical, 8 high, 6 moderate, 1 low), including YAML complexity, URI/host confusion, Hono/HTTP, body-parser, qs, and test-tool findings.
- Changes: Upgraded MCP SDK, Express, js-yaml, Vitest/Vite, ESLint, and typescript-eslint; removed `gray-matter` and its stale js-yaml 3 chain in favor of a local conventional frontmatter parser backed by patched js-yaml; pinned patched esbuild through a precise override; migrated to ESLint flat config; enabled newly surfaced lint rules and fixed the two findings; added strict production audits to CI, publish workflow, and `prepublishOnly`.
- Resolved versions: MCP SDK 1.30.0; Express 4.22.2; js-yaml 4.3.2; Hono 4.13.5; @hono/node-server 2.1.1; fast-uri 3.1.6; express-rate-limit 8.7.0; ip-address 10.7.0; body-parser 1.20.6/2.3.0; qs 6.15.3; brace-expansion 1.1.18/2.1.4; Vitest 4.1.11; Vite 8.2.2; ESLint 10.9.1; esbuild 0.28.1.
- Files changed: Package manifests/lock, ESLint config, CI/publish workflows, frontmatter/markdown/verbal/config/font parsers, and YAML/frontmatter compatibility tests.
- Tests added: BOM, CRLF, nested YAML, body delimiter, YAML terminator, scalar normalization, and merge-key compatibility across component, token, verbal, and YAML inputs.
- Verification commands: Focused 52 tests; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run prepublishOnly`; production and full audits; `npm ls`; clean `npm ci`; Node 20.20.2 and 22.23.2 tests/import/CLI/lint; pack/empty-consumer install/import/CLI/audit; `git diff --check`.
- Verification results: Full 37 files / 285 tests pass; all compile/lint/build/pack/consumer gates pass; production audit is 0 and full audit is 0 across all severities.
- Security review: No advisory is suppressed; the only override pins a patched esbuild version and is covered by build/test gates; config YAML parse errors now retain their original cause.
- Compatibility review: Conventional `---` frontmatter, `---`/`...` closers, BOM/CRLF, nested YAML, body delimiters, and scalar normalization are covered; contributor lint tooling requires Node 20.19 or newer, while runtime builds and tests pass current Node 20 and 22.
- Remaining risks: Advertised Vercel and Cloudflare adapter claims remain to be made real or removed.
- Rollback: Revert this story commit and reinstall; that restores known critical/high advisories and removes audit enforcement.
- Commit: Pending at time of entry.
- Next eligible story: VERCEL-001.

## 2026-08-29 01:56 EDT — VERCEL-001

- Objective: Replace the broken warm-instance SSE adapter with a real cold-start-safe Vercel MCP function.
- Defect reproduced: The legacy adapter had no default export, no authentication, and stored SSE sessions only in warm-instance memory, so cold starts and fan-out broke initialize/message flows.
- Changes: Added a discoverable `/api/mcp` default function; build and package the Vercel adapter; use one fresh stateless Streamable HTTP Server/transport per POST; warm-cache immutable index data only; require bearer auth; validate Host/Origin from Vercel/custom-domain environment; cap JSON at 256 KiB and work at 30 seconds; return structured redacted errors; explicitly bundle read-only starter data; modernize `vercel.json` with a 60-second function limit and package the deployment files.
- Files changed: `src/adapters/vercel.ts`, `api/mcp.js`, `vercel.json`, `tsup.config.ts`, `package.json`, `README.md`, and `src/tests/vercel-adapter.test.ts`.
- Tests added: Two isolated module cold starts using the real MCP client for initialize/listTools/get_brand_overview; write-tool hiding; missing auth; hostile Host; authenticated GET 405/Allow; malformed and oversized bodies; redacted missing-brand failure; config/build/pack discovery contract.
- Verification commands: Focused 5 tests; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; production/full audits; `npm ls`; pack dry run and installed-tarball default-export import; `git diff --check`.
- Verification results: Full 37 files / 287 tests pass; typecheck, lint, build/DTS, audits (0), dependency tree, package/import, and diff check pass. Vercel CLI 58.7.1 is installed, but `vercel build` was not run because this checkout has no `.vercel` link and linking would create external project state.
- Security review: Token and trusted hosts are mandatory/fail closed; errors do not expose paths or brand data; request state is never reused; serverless tools are read-only.
- Compatibility review: Legacy `/api/sse` and `/api/messages` are replaced by current `/api/mcp`; the bundled starter is the safe default. Custom brand deployments set `BRANDKIT_CONFIG` and update `includeFiles` for the complete config/root.
- Skill influence: Vercel Functions guidance drove the stateless request design, immutable external state contract, discoverable `api/` entry, explicit `includeFiles`, and duration headroom.
- Remaining risks: The Cloudflare Worker still advertises endpoints it does not implement.
- Rollback: Revert this story commit; this restores an unauthenticated warm-instance SSE adapter that is not production-safe.
- Commit: Pending at time of entry.
- Next eligible story: CLOUDFLARE-001.

## 2026-08-29 02:00 EDT — CLOUDFLARE-001

- Objective: Ensure the repository does not advertise a Cloudflare MCP deployment that cannot complete an MCP handshake.
- Defect reproduced: `wrangler.toml` deployed a simplified Worker that advertised `/sse` and `/messages`, but the adapter implemented only `/` and `/health`; both advertised MCP endpoints returned 404, and the target had no authentication or MCP server transport.
- Decision: Retire the unsupported Cloudflare target instead of presenting a nonfunctional or insecure deployment as production-ready.
- Changes: Removed `wrangler.toml` and the Worker stub; removed active Cloudflare references from architecture, release, and runtime-version documentation; replaced the Worker-specific hardcoded-version test with a release-wide contract that keeps `package.json`, `server.json`, and registry package versions aligned.
- Files changed: `wrangler.toml`, `src/adapters/cloudflare-worker.ts`, `src/tests/cloudflare-version.test.ts`, `src/tests/release-version.test.ts`, `src/version.ts`, `RELEASING.md`, and `CLAUDE.md`.
- Verification commands: Focused release-version test, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm audit --omit=dev`, package dry run, Cloudflare/Wrangler claim audit, and `git diff --check`.
- Verification results: Focused test passes; full 37 files / 287 tests pass; typecheck, lint, build/DTS, production audit (0 vulnerabilities), package audit, and diff check pass. No Cloudflare/Wrangler adapter or configuration ships in the npm package.
- Security review: Removing the unauthenticated stub closes a misleading network surface; future Cloudflare support must provide a real authenticated MCP transport and immutable/data-store architecture before it is advertised.
- Compatibility review: Cloudflare deployment is intentionally unsupported. The documented and packaged stdio, HTTP/SSE, Docker, and Vercel paths are unchanged.
- Remaining risks: QA-001 now requires two consecutive independent adversarial passes with no new actionable findings.
- Rollback: Reverting this story would restore a deployment target whose advertised MCP endpoints always return 404 and should not be done without a complete Worker implementation.
- Commit: Pending at time of entry.
- Next eligible story: QA-001.

## 2026-08-29 02:10 EDT — QA-001 adversarial pass 1 (failed discovery gate)

- Objective: Complete the first of two consecutive issue-free adversarial production reviews.
- Result: The pass was not issue-free. QA-001 remains failing and the consecutive-pass counter resets to zero.
- Confirmed high issues: Process-global index cross-contaminates concurrent servers; preview lacks rebinding/non-loopback disclosure controls; `init` overwrites existing and symlinked config; network `startServer()` resolves before listen succeeds; manual publish version is shell-injectable; release executes a mutable unverified latest publisher binary.
- Confirmed medium issues: Token formatting permits prototype pollution; ingestion has no size/traversal budget; five-file docs generation can partially commit; hot reload follows symlinks and ignores scanner exclusions; `search_brand` accepts negative/unbounded limits.
- Baseline evidence: `npm run typecheck`, `npm run lint`, 37 files / 287 tests, `npm run build`, production/full audits with zero vulnerabilities, and `git diff --check` all pass, demonstrating the findings are gaps not caught by existing gates.
- Ralph action: Added eleven open entries to `discovered-bugs.json`, eleven failing remediation stories, and made all eleven dependencies of QA-001. No severity or acceptance criterion was weakened.
- Next eligible story: STATE-001.

## 2026-08-29 02:24 EDT — STATE-001

- Objective: Prevent concurrent programmatic servers from sharing or overwriting mutable brand index state.
- Defect reproduced: A module-global `currentIndex` meant starting a second server changed the brand returned by tools on the already-running first server; watcher callbacks also wrote the same shared slot.
- Changes: Replaced global state with a per-`startServer()` mutable `indexRef` captured by that invocation's MCP factories, transports, and watcher callback.
- Files changed: `src/index.ts` and `src/tests/server-state-isolation.test.ts`.
- Tests added: Two live HTTP/MCP servers retain distinct Alpha/Beta brands; a mocked watcher update changes only its owning Alpha server while Beta remains unchanged.
- Verification commands: Focused isolation/network/HTTP matrix, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused 24 tests pass; full 38 files / 289 tests pass; typecheck, lint, build/DTS, and diff check pass.
- Security review: No process-global brand data remains in the main server entry point; each tool callback resolves only its server-owned index.
- Compatibility review: Stdio, SSE, HTTP, sync context, and hot reload interfaces are unchanged.
- Remaining risks: Watcher process-signal lifecycle is unchanged and will be re-examined by the clean adversarial passes after all recorded fixes.
- Rollback: Revert this story commit; that would restore confirmed cross-server data disclosure.
- Commit: Pending at time of entry.
- Next eligible story: PREVIEW-001.

## 2026-08-29 02:29 EDT — PREVIEW-001

- Objective: Prevent DNS rebinding and unauthenticated disclosure through the visual preview UI.
- Defect reproduced: Hostile Host headers reached preview pages, assets, and static files; hostile Origins were accepted; configuration or CLI flags could bind preview on wildcard/LAN interfaces without credentials.
- Decision: Keep preview a trusted local development surface instead of adding a second remotely authenticated product surface.
- Changes: Preview now refuses every non-loopback host before indexing, watching, or listening; `createPreviewServer` independently enforces the same invariant; shared Host/Origin validation runs before every route including static assets; remote users are directed to authenticated MCP HTTP.
- Files changed: `README.md`, `src/preview/server.ts`, `src/cli/commands/preview.ts`, `src/tests/preview-server.test.ts`, and `src/tests/network-binding.test.ts`.
- Tests added: Hostile Host rejection for page, asset, and static routes; hostile Origin rejection; normal loopback browser/static behavior; wildcard, LAN, and config-derived non-loopback refusal.
- Verification commands: Focused 45-test preview/policy/binding/context matrix, built CLI smoke, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 38 files / 298 tests pass; typecheck, lint, build/DTS, CLI smoke, and diff check pass. Built CLI returns 403 before brand content for hostile Host/Origin and exits before indexing for `--host 0.0.0.0`.
- Security review: No preview credential exists to leak or log because remote binds are refused; request validation precedes static and dynamic content.
- Compatibility review: `localhost`, `127.0.0.1`, and `::1` preview workflows remain supported; remote preview binding is intentionally removed.
- Rollback: Revert this story commit; that restores confirmed unauthenticated brand disclosure.
- Commit: Pending at time of entry.
- Next eligible story: INIT-001.

## 2026-08-29 02:37 EDT — INIT-001

- Objective: Make project initialization non-destructive for existing and redirected destinations.
- Defect reproduced: `init` checked only `brand_atomic_system/`, then unconditionally wrote `brandkit.config.yaml`; a config-only project was overwritten and a config symlink redirected the write outside the target.
- Changes: Preflight target, brand, and config identities before mutation; require explicit `--force` for either safe existing destination; reject symlink, hard-linked config, non-regular config, and unsafe brand targets; validate bundled template entries with no-follow identity checks; stage the full scaffold; commit brand/config through same-directory rename backups with rollback; use the shared atomic writer for config bytes.
- Files changed: `README.md`, `src/cli/commands/init.ts`, `src/cli/index.ts`, and `src/tests/init-safety.test.ts`.
- Tests added: Existing config-only and brand-only conflicts; external config symlink preservation; hard-link preservation; non-regular config; brand symlink; fresh init; clean force replacement; deterministic fourth-rename failure after both originals are backed up, proving byte-identical rollback and no temp/backup artifacts.
- Verification commands: Focused 16-test init/CLI matrix, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 39 files / 307 tests pass; typecheck, lint, build/DTS, rollback injection, and diff check pass.
- Security review: Final destination symlinks are never followed; hard-linked config and special files are refused; template source opens use no-follow and inode revalidation.
- Compatibility review: Fresh init output and brand-name YAML quoting remain compatible; `--force` now has explicit safe replacement semantics and the Commander-facing function signature remains two arguments.
- Rollback: Revert this story commit; that restores destructive config writes and symlink redirection.
- Commit: Pending at time of entry.
- Next eligible story: HTTP-003.

## 2026-08-29 02:43 EDT — HTTP-003

- Objective: Make HTTP/SSE startup completion and failure observable and resource-safe for programmatic callers.
- Defect reproduced: On an occupied port, `await startServer()` returned a non-listening server, then a late `EADDRINUSE` escaped as an uncaught error.
- Changes: Added a shared listen-wait helper; HTTP and SSE now resolve only after the listening event and reject the initial error event; network watchers start only after bind succeeds; startup failure closes any bound socket and removes watcher/signal state; closing a returned network server also stops its watcher; cleanup is memoized across close, signal, and failure paths.
- Files changed: `src/index.ts`, `src/network.ts`, and `src/tests/server-startup.test.ts`.
- Tests added: Occupied HTTP and SSE ports; no uncaught error, watcher, or signal leak; successful ephemeral listening; post-start runtime error listener behavior; watcher-start failure after bind; embedder server close; overlapping SIGTERM/server-close cleanup exactly once.
- Verification commands: Focused 23-test startup/HTTP/auth matrix, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Verification results: Focused tests pass; full 40 files / 315 tests pass; typecheck, lint, build/DTS, and diff check pass.
- Security review: Failed binds no longer leave watchers or protocol state active; cleanup errors are redacted and credentials remain untouched.
- Compatibility review: Successful HTTP/SSE return values and ephemeral ports are unchanged; callers gain reliable await/reject semantics and server close now owns watcher lifecycle.
- Rollback: Revert this story commit; that restores late uncaught startup failures.
- Commit: Pending at time of entry.
- Next eligible story: CI-001.

## 2026-08-29 02:47 EDT — CI-001

- Objective: Remove command injection from the privileged manual/tag publish workflow.
- Defect reproduced: A workflow-dispatch version containing command substitution was interpolated into shell source and created a marker file under the original resolver.
- Changes: Route manual and resolved versions into shell steps only through environment variables; resolve dispatch versus v-tag in a Node script; enforce full strict SemVer before writing `GITHUB_OUTPUT`; consume the validated environment value for metadata synchronization and release summary.
- Files changed: `.github/workflows/publish.yml`, `scripts/resolve-publish-version.mjs`, and `src/tests/publish-workflow.test.ts`.
- Tests added: Parsed workflow prohibits GitHub expression interpolation in every publish `run`; valid stable/prerelease/build SemVer; invalid leading zeros/prefixes/whitespace; v-tag normalization; package/registry synchronization; command substitution, backticks, semicolon, newline/output, and quote payloads remain inert.
- Verification commands: Focused 19-test publish/release matrix, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm audit --omit=dev`, and `git diff --check`.
- Verification results: Focused tests pass; full 41 files / 333 tests pass; typecheck, lint, build, production audit (0), and diff check pass.
- Security review: No untrusted workflow expression is parsed as shell source; validated versions contain no shell or workflow-command metacharacters.
- Compatibility review: Manual releases and `v*` tag releases retain their existing version synchronization and summaries; invalid tags now fail closed.
- Rollback: Revert this story commit; that restores confirmed privileged workflow command execution.
- Commit: Pending at time of entry.
- Next eligible story: CI-002.

## 2026-08-29 02:52 EDT — CI-002

- Objective: Prevent mutable or replaced third-party release tooling from executing in privileged CI jobs.
- Defect reproduced: Publish downloaded `mcp-publisher` through a mutable `releases/latest` URL, piped it directly into extraction, and executed it without integrity verification; all Actions used mutable major tags.
- Changes: Pin mcp-publisher v1.7.9; select only Linux amd64/arm64 and fail closed otherwise; download to a temporary archive over constrained HTTPS; verify fixed per-architecture SHA-256 before extracting one member and granting execute permission; pin checkout/setup-node across CI and publish to full commit SHAs with release comments.
- Integrity values: Linux amd64 `ab128162b0616090b47cf245afe0a23f3ef08936fdce19074f5ba0a4469281ac`; Linux arm64 `04f5199b3deef8e6fc4d6ed98c56a74f799def53edca3fe6d4862ecd4397c172`.
- Immutable Actions: checkout v5.1.0 `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`; setup-node v5.0.0 `a0853c24544627f65ddf259abe73b1d18a591444`.
- Files changed: `.github/workflows/publish.yml`, `.github/workflows/ci.yml`, and `src/tests/publish-workflow.test.ts`.
- Tests added: Exact publisher version/checksums; verification precedes extraction/permission; no latest URL or curl-to-tar pipeline; unsupported platform failure; every external Action in every workflow is a full 40-character SHA.
- Verification commands: Independently download/hash both official release archives; focused 24-test publish/Docker workflow matrix; mutable-reference grep; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, production/full audits, and `git diff --check`.
- Verification results: Official archive hashes reproduce; focused tests pass; full 41 files / 335 tests pass; typecheck, lint, build, both audits (0), mutable-reference audit, and diff check pass.
- Security review: Integrity is checked before archive parsing or execution; release URLs and action code are immutable; OIDC permissions are unchanged and remain job-scoped.
- Compatibility review: Publish still supports Ubuntu amd64 and arm64 runners; current job is amd64. The release was not dispatched because doing so would publish externally.
- Rollback: Revert this story commit; that restores unauthenticated mutable release-tool execution.
- Commit: Pending at time of entry.
- Next eligible story: FMT-001.

## 2026-08-29 02:55 EDT — FMT-001

- Objective: Preserve arbitrary token names/types without mutating or consulting JavaScript object prototypes.
- Defect reproduced: Tailwind grouping treated inherited `constructor`/`prototype`/`__proto__` properties as buckets or setters, enabling process-global object mutation and lost output; W3C serialization dropped `__proto__` tokens.
- Changes: Added a typed null-prototype dictionary helper and used it for both Tailwind type/name buckets and W3C token output; documented reserved-looking strings as valid data.
- Files changed: `src/formatters/token-formatters.ts` and `src/tests/formatters.test.ts`.
- Tests added: All three reserved strings as token types and names; constructor-prototype path; exact Object/Object.prototype preservation; deterministic repeated serialization; W3C key preservation; byte-exact normal Tailwind/W3C compatibility.
- Verification commands: Focused 32-test formatter/visual-tool matrix, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, formatter construction audit, and `git diff --check`.
- Verification results: Focused tests pass; full 41 files / 337 tests pass; typecheck, lint, build/DTS, audit, and diff check pass.
- Security review: No keyed formatter output uses an inherited prototype; hostile names remain inert JSON data.
- Compatibility review: Normal serialized output is byte-for-byte unchanged; previously lost reserved-looking tokens now appear correctly.
- Rollback: Revert this story commit; that restores prototype pollution and token loss.
- Commit: Pending at time of entry.
- Next eligible story: SCAN-001.
