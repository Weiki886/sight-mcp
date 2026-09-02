# v0.1.0 release process

- Status: published 2026-09-02; tag `v0.1.0` and GitHub Release shipped
- Owner: repository maintainer
- Related: [Issue #6](https://github.com/Weiki886/sight-mcp/issues/6),
  [v0.1.0 release notes](v0.1.0.md), [Host smoke procedure](host-smoke.md),
  [accepted local smoke record](smoke-record-v0.1.0-rc.md),
  [profile smoke record](profile-smoke-record-2026-09-01.md)

This runbook separates reproducible preparation from the irreversible npm publish, Git tag, and
GitHub Release steps. No release operator may rebuild the tarball after it has passed Host smoke.

## Candidate construction

The CI `release-candidate` job runs on Node.js 22 after both supported Node quality jobs pass. It
invokes:

```sh
pnpm release:candidate -- --output "$RUNNER_TEMP/sight-mcp-candidate"
```

That command builds once, runs `pnpm pack` once, calculates SHA-256, installs the same archive into
an empty temporary directory, calls its packed CLI through the official MCP client, and creates an
npm-generated CycloneDX SBOM. The uploaded artifact contains only:

- `weiki-sight-mcp-0.1.0.tgz`;
- `release-manifest.json` with source commit and digest;
- `clean-install-smoke.json` with sanitized scenario results;
- `sight-mcp-0.1.0.sbom.cdx.json`.

A `main` push downloads that exact workflow artifact and creates GitHub build provenance. The
attestation job is the only job with `id-token: write` and `attestations: write`; it never runs for
pull requests.

## Required approval evidence

Before publication, the maintainer must verify all of the following against one digest:

1. CI quality jobs pass on Node.js 22 and 24.
2. Candidate manifest `source.commit` is the reviewed `main` commit.
3. Local SHA-256 equals `artifact.sha256`.
4. `gh attestation verify weiki-sight-mcp-0.1.0.tgz --repo Weiki886/sight-mcp` succeeds.
5. The CycloneDX SBOM identifies `@weiki/sight-mcp@0.1.0` and its installed production tree.
6. Claude Code and Codex Host records pass for that digest. For a candidate containing Issue #16,
   the live Qwen/DeepSeek profile records must also pass for that digest without placing credentials
   in Host config or command arguments.
7. `pnpm audit --prod --audit-level high`, the production-license gate, package allowlist, workflow
   security gate, and repository secret scan are reviewed.
8. npm identity and scoped-package ownership are proven while authenticated:

   ```sh
   npm whoami
   npm access list packages @weiki --json
   npm view @weiki/sight-mcp name version --json
   npm publish weiki-sight-mcp-0.1.0.tgz --dry-run --access public
   ```

   The expected first-release registry lookup is `E404`, but `npm whoami` and scope access must
   establish that the operator controls `@weiki`. An unauthenticated `E404` alone is not proof.

9. The npm account has 2FA or a configured trusted publisher. For GitHub trusted publishing, the
   public package and repository mapping must be exact and npm will generate package provenance.
10. A human explicitly approves npm publish, Tag, and GitHub Release after reviewing these items.

At preparation time on 2026-08-31, the package registry returned `E404`, this workstation was not
authenticated to npm, and the `@weiki` scope could not be proven. Publication therefore remains
blocked even though candidate engineering can be merged. On 2026-09-02 the maintainer resolved the
identity and published `@weiki/sight-mcp@0.1.0`, then shipped the `v0.1.0` tag and GitHub Release;
scope ownership is now proven by the live, account-signed package.

## Publication sequence after approval

1. Download the already-attested `main` candidate artifact; do not run `pnpm pack` again.
2. Recalculate SHA-256 and verify GitHub provenance.
3. Publish the exact `.tgz` through the approved npm identity/trusted-publisher path.
4. Verify `npm view @weiki/sight-mcp@0.1.0 dist.integrity dist.tarball` and perform a clean registry
   install plus discovery call.
5. Create signed/verified tag `v0.1.0` on the manifest source commit.
6. Create the GitHub Release from that tag using [the prepared notes](v0.1.0.md), attach the exact
   tarball, manifest, SBOM, and verification instructions, then check every public link.
7. Close Issue #6 and the milestone only after npm, GitHub Release, and post-publish smoke succeed.

The project follows npm's [trusted publishing guidance](https://docs.npmjs.com/trusted-publishers/)
and GitHub's
[artifact attestation guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## Rollback and forward fix

Before publication, reject the candidate and fix forward on a reviewed commit. After publication,
never overwrite or reuse `0.1.0`:

1. stop promoting the affected artifact and document impact;
2. use `npm deprecate @weiki/sight-mcp@0.1.0 "<concise reason and safe version>"` only with explicit
   maintainer approval;
3. prepare a reviewed patch version with a new digest, SBOM, attestations, and both Host records;
4. publish the patch and update the GitHub advisory/release notes as appropriate.

Deleting a Git tag or GitHub Release does not remove an npm artifact and is not a rollback.
