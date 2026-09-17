# Claude Code and Codex Host smoke

**语言 / Language：** [中文](host-smoke.md) · English

- Scope: v0.1.0 release candidate
- Inputs: one candidate `.tgz`, synthetic fixtures, local synthetic OpenAI-compatible endpoint
- Output: sanitized JSON records tied to the candidate SHA-256

The accepted local v0.1.0 candidate evidence is recorded in
[smoke-record-v0.1.0-rc.md](smoke-record-v0.1.0-rc.en.md). Issue #16's pre-merge live profile
evidence is recorded separately in
[profile-smoke-record-2026-09-01.md](profile-smoke-record-2026-09-01.en.md).

Run this matrix from the packed artifact, never from the source checkout. The helper installs the
archive into a new temporary directory, creates non-personal fixtures at runtime, starts a loopback
Provider, gives each Host an isolated MCP configuration, and discards raw Host output.

```sh
pnpm release:host-smoke -- \
  --host claude-code \
  --archive /absolute/path/to/weiki-sight-mcp-0.1.0.tgz \
  --record /absolute/path/to/claude-code-smoke.json

pnpm release:host-smoke -- \
  --host codex \
  --archive /absolute/path/to/weiki-sight-mcp-0.1.0.tgz \
  --record /absolute/path/to/codex-smoke.json
```

The Host must already be installed and authenticated. No Provider key is used. The script validates:

| Scenario         | Expected result                                                         |
| ---------------- | ----------------------------------------------------------------------- |
| discovery        | Host discovers and calls `analyze_image` from the installed tarball     |
| chart            | synthetic Provider answer contains the expected month/value             |
| OCR style        | synthetic Provider answer contains the expected invoice text            |
| denied path      | Tool returns `PATH_NOT_ALLOWED`                                         |
| Provider failure | local HTTP 503 maps to `PROVIDER_UNAVAILABLE` without unbounded retries |
| cancellation     | interrupting the Host aborts the in-flight Tool/Provider request        |

Each record contains only Host/version, Node, OS, local Provider classification, digest, timestamp,
and pass/fail statuses. It must not contain credentials, personal paths, images, raw model output,
complete prompts, Provider request bodies, or stdout/stderr captures. Review records for that rule
before attaching them to a release.

## Live remote mode (`--live`)

Add `--live` to validate the packed artifact against a remote Provider. The runner requires
`SIGHT_PROVIDER_BASE_URL`, `SIGHT_PROVIDER_MODEL`, and `SIGHT_PROVIDER_API_KEY` in its inherited
environment; it creates one synthetic chart and performs one bounded vision call. Provide the key
through an authorized terminal or secret manager, never in runner arguments or committed files.

```sh
SIGHT_PROVIDER_BASE_URL=https://provider.example/v1 \
SIGHT_PROVIDER_MODEL=your-vision-model \
SIGHT_PROVIDER_API_KEY=… \
pnpm release:host-smoke -- \
  --host claude-code \
  --archive /absolute/path/to/weiki-sight-mcp-0.3.0.tgz \
  --record /absolute/path/to/claude-live.json \
  --live
```

The live record contains only discovery/vision status and the "remote OpenAI-compatible endpoint"
classification. The host inherits the endpoint, model, and credential from the runner process; the
generated MCP config carries no extra server arguments. This live mode complements rather than
replaces the deterministic local matrix: the provider-failure and cancellation gates still run
against the local synthetic endpoint.
