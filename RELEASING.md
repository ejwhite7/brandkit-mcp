# Releasing

Releases are automated by `.github/workflows/publish.yml`, which fires on
any tag matching `v*` and publishes to **npm** and the **MCP Registry**
in one go.

## One-time setup

1. Create an npm **automation** token scoped to the `brandkit-mcp` package:

   ```bash
   npm token create \
     --name=brandkit-mcp-ci \
     --packages=brandkit-mcp \
     --packages-and-scopes-permission=read-write
   ```

   Copy the printed token (starts with `npm_...`).

2. Add it to the repo as a GitHub Actions secret:

   ```bash
   gh secret set NPM_TOKEN --repo ejwhite7/brandkit-mcp
   # paste the token at the prompt
   ```

3. The MCP Registry uses **GitHub OIDC** -- no token to manage. The
   workflow already requests `id-token: write`.

## Cutting a release

```bash
# 1. Make sure main is green
git checkout main && git pull

# 2. Tag (no need to bump package.json by hand -- the workflow syncs
#    the version into package.json AND server.json from the tag)
git tag v0.1.1
git push origin v0.1.1
```

That's it. The workflow will:

1. Sync the tag's version into `package.json` and `server.json`.
2. Run typecheck, lint, tests, and build.
3. `npm publish --provenance` (sigstore-signed provenance attestation).
4. `mcp-publisher login github-oidc` then `mcp-publisher publish`.
5. Write a release summary linking to npm and the MCP Registry.

## Manual / out-of-band release

If you need to publish without cutting a git tag (e.g. re-publishing a
patch version), trigger the workflow manually and supply a version:

```bash
gh workflow run publish.yml --repo ejwhite7/brandkit-mcp -f version=0.1.2
```

## Versioning rules

- The MCP Registry **rejects** re-publishing the same version. Each
  release must strictly increase the semver.
- `package.json` and `server.json` versions must match. The workflow
  enforces this by overwriting both from the tag.
- Yank a bad release with `npm deprecate brandkit-mcp@x.y.z "reason"`
  and `mcp-publisher status` for the registry.
