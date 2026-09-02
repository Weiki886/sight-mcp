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

## Live built-in profile mode

Add `--profile qwen|deepseek` to validate the packed profile entry against its remote Provider. The
runner requires `SIGHT_PROVIDER_API_KEY` in its inherited environment, creates a synthetic chart,
and performs one bounded vision call. Supply the key through an already authorized terminal or
secret manager; never put it in the runner arguments or a committed file.

```sh
pnpm release:host-smoke -- \
  --host claude-code \
  --archive /absolute/path/to/weiki-sight-mcp-0.1.0.tgz \
  --record /absolute/path/to/claude-qwen-profile.json \
  --profile qwen
```

The profile record contains only discovery/vision status and the profile name. The Host inherits the
credential from the runner process; the generated MCP config and `--provider` server arguments do
not contain it. This live mode supplements rather than replaces the deterministic local matrix:
Provider failure and cancellation gates stay on the local synthetic endpoint.

If a Host fails, keep the candidate unpublished, retain only sanitized diagnostics, fix forward,
create a new candidate, and rerun the full matrix for both Hosts. A source-level MCP client test is
not a substitute for this matrix, though it remains an independent protocol regression gate.
