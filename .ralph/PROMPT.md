# BrandKit MCP remediation loop

Read `.ralph/remediation-prd.json`, `.ralph/progress.md`, `.ralph/failures.md`,
and `.ralph/discovered-bugs.json` before making changes.

1. Select the highest-priority unblocked story with `passes: false`.
2. Work on that story only.
3. Reproduce the defect and add a regression test when practical.
4. Implement the narrowest production-ready fix.
5. Run the story checks, then run `npm run typecheck`, `npm run lint`,
   `npm test`, `npm run build`, and `git diff --check`.
6. Self-review the complete diff for security, correctness, compatibility,
   error handling, and unrelated changes.
7. Set `passes: true` only when every acceptance criterion has evidence.
8. Append the commands, results, risks, and next story to `progress.md`.
9. Record repeated failures in `failures.md`. Never conceal or bypass a gate.
10. Commit one completed story per commit when repository policy allows it.

Newly discovered actionable bugs must be appended to `discovered-bugs.json`
and added as failing stories. Existing criteria may not be deleted or weakened.

`<promise>PRODUCTION_COMPLETE</promise>` is permitted only when every story
passes, no discovered bug remains open, two consecutive adversarial reviews
find no new actionable issue, clean-room verification passes, all advertised
deployment targets pass an MCP handshake, and the release has human approval.

