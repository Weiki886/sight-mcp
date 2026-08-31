# v0.1.0 supply-chain review

- Reviewed: 2026-08-31
- Scope: release preparation in Issue #6
- Decision: candidate automation accepted; npm identity and final publication remain blocked

## Package boundary

- Distribution identity is only `@weiki886/sight-mcp`; commands never install the unrelated unscoped
  `sight-mcp` package.
- Metadata is version `0.1.0`, MIT, public access, Node.js 22+, exact repository URL, and provenance
  enabled. `private` is absent so an approved publish is technically possible.
- The tarball allowlist permits only `LICENSE`, `README.md`, sanitized `package.json`, and `dist/`.
- `dist/cli.js` must retain its Node shebang and executable mode.
- External JavaScript/declaration source maps are included for diagnostics, but embedded
  `sourcesContent`, TypeScript source files, absolute paths, and personal paths are rejected.
- Clean install, CLI discovery/calls, SHA-256 manifest, and CycloneDX generation all consume one
  tarball.

## Workflow boundary

- Workflow default permission is `contents: read`.
- Pull requests never use `pull_request_target`, `workflow_run`, repository secrets, OIDC, or write
  permissions.
- Only the `main`-push attestation job receives `id-token: write` and `attestations: write`.
- All Actions are pinned to full reviewed commit SHAs. Added release Actions were resolved from
  their official repositories:
  - `actions/upload-artifact` v7.0.1 — `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`;
  - `actions/download-artifact` v8.0.1 — `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`;
  - `actions/attest-build-provenance` v4.2.2 — `4d101475d8b20a2381f78447822ac1eab6504dd8`.
- Candidate artifacts are retained for 14 days and named with the source commit.

## Dependencies, licenses, and vulnerabilities

The production license gate accepts only the reviewed set observed from the locked installation:
MIT, Apache-2.0, ISC, and LGPL-3.0-or-later. The LGPL component is the platform libvips package used
by `sharp`; it remains a separate dependency rather than project source. Platform-specific SBOMs may
contain different `@img/sharp-*` packages and must be generated from the actual candidate
installation.

`pnpm audit --prod --audit-level high` is a required local and CI gate. The SBOM complements but
does not replace vulnerability review. Dependency versions remain locked by `pnpm-lock.yaml` for
source builds; the release SBOM records the actual npm clean-install tree for the tarball.

## Repository controls and known gaps

GitHub secret scanning and push protection were enabled when reviewed. Dependabot security updates
were disabled and `main` had no repository-enforced branch protection/ruleset. This delivery still
uses PR review and required observed CI before merge, but maintainers should enable repository-level
required checks and dependency updates as a separate governance change. These gaps do not authorize
bypassing the release approval checklist.

npm registry lookup returned `E404` for `@weiki886/sight-mcp`, but this workstation had no npm
authentication and npm could not establish access to `@weiki886`. Package-name absence is therefore
recorded; ownership/publishability is not accepted until the authenticated checks in the release
runbook pass.
