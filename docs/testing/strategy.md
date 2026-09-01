# Test and delivery strategy

- Status: Accepted
- Accepted: 2026-08-28
- Amended: 2026-09-01 by Issue #16 (Keychain profiles) and clipboard image input
- Scope: v0.1.0
- Related: [Proposal 0001](../proposals/0001-sight-mcp-v0.1.0.md),
  [threat model](../security/threat-model.md)

## Objectives

Tests must prove the vision bridge is contract-compatible, bounded, private by default,
deterministic without paid services, installable from its published artifact, and usable from both
target hosts.

The normal test suite never calls a live provider and never requires a real credential.

## Test layers

| Layer               | Scope                                                                                                        | Representative evidence                                     | PR gate                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| Unit                | schemas, config, paths, redaction, image policy, error mapping, retry decisions                              | deterministic Vitest results                                | required                                      |
| Provider contract   | HTTP request shape, response parsing, status mapping, deadlines, redirects, body bounds                      | local mock HTTP server and fake clock                       | required for provider changes                 |
| MCP integration     | initialize, tools/list, tools/call, structured/text output, errors, cancellation, shutdown, stdout integrity | spawned stdio client using official MCP client package      | required for tool/transport changes           |
| Packaging           | packed-file allowlist, CLI executable, clean install, license, startup failure/success                       | `pnpm pack` tarball installed into a temporary directory    | required before release and packaging changes |
| Host compatibility  | documented Claude Code and Codex setup with the same fixtures                                                | manual smoke-test record with versions and sanitized output | required before release                       |
| Security regression | threat IDs from the threat model                                                                             | dedicated test names linked to threat IDs                   | required for affected boundary                |

## Fixture policy

- Commit only synthetic, public-domain, or project-created fixtures with no personal or confidential
  data.
- Keep source fixtures small. Generate large-byte or extreme-dimension streams in tests without
  committing huge binaries.
- Include PNG, JPEG, WebP, alpha, orientation metadata, malformed data, misleading extension,
  unsupported format, EXIF/GPS, and adversarial text fixtures.
- Store expected answers only for the deterministic fake provider. Do not assert natural-language
  equality from a real model.
- Every binary fixture has a short provenance/readme entry and expected security purpose.
- Issue #3 image fixtures are generated programmatically by the security tests, keeping binary
  provenance explicit without committing opaque sample files.

## Unit matrix

### Configuration

- required provider URL/model present and absent;
- HTTPS remote and exact loopback HTTP acceptance;
- rejection of credentials in URL, query, fragment, invalid port, operation-path ambiguity, and
  non-HTTP schemes;
- lower/upper bounds for every integer;
- cwd-only root default and platform-delimited explicit roots;
- nonexistent, relative, duplicate, nested, root-level, and home-level allowed roots;
- secret redaction at every log level and error path.
- fixed Qwen/DeepSeek endpoint, model, and default-effort mappings;
- profile credential precedence: generic override, selected Provider environment variable, then
  selected Keychain account;
- an unselected Provider credential is never read and missing/failed Keychain lookup fails closed;
- generic no-argument configuration remains backward compatible.

### Credential CLI and macOS Keychain

- the CLI parser accepts only the documented profile and credential command grammar and returns
  usage status `2` for invalid input;
- set invokes the absolute system command without a shell, puts prompt-only `-w` last, passes no
  secret argument, and rejects a non-interactive terminal;
- get/status/delete use the exact service and selected account; status never requests password
  output;
- missing item exit status, unavailable platform, command failure, timeout, and oversized output map
  to sanitized bounded behavior;
- delete prompts by default, cancellation does not mutate state, and `--yes` is explicit;
- synthetic canary values do not appear in errors, logs, status output, or serialized config.

### Input authorization

- absolute path acceptance inside a root;
- relative path, traversal, sibling-prefix, separator, Unicode, and platform casing behavior;
- target outside root through symlink/junction;
- missing path, directory, and available special-file types;
- exact source-byte limit, one byte over, and file growth during read;
- cancellation before open, during read, and after read.

### Clipboard reading

- non-macOS returns `CLIPBOARD_UNAVAILABLE` without spawning a helper;
- confirmation precedes every read and rejection maps to `CLIPBOARD_ACCESS_DENIED`;
- empty or non-image clipboard maps to `CLIPBOARD_NO_IMAGE`;
- command failure, non-zero exit, and unexpected status map to `CLIPBOARD_READ_FAILED`;
- cancellation before and during read maps to `CANCELLED`;
- temporary file uses a user-private `0700` directory and a random name, and is deleted on success,
  failure, limit rejection, and abort;
- oversize staged image maps to `FILE_TOO_LARGE`.

### Image pipeline

- PNG/JPEG/WebP detection from decoded content rather than extension;
- unsupported, truncated, malformed, and misleading content;
- source bytes, decoded pixels, dimension, and transmit-dimension boundaries;
- transmit-byte and JPEG-quality boundaries, including an image that cannot be reduced safely;
- EXIF orientation is applied and metadata is absent after output;
- transparent input stays PNG; opaque output uses JPEG;
- no enlargement below the transmit bound;
- pixel and dimension failures map to stable errors;
- cancellation and decoder exception sanitization.

### Domain and errors

- stable success/error schema validation;
- every error code maps to the intended `isError`, message, and retryability;
- no result contains path, prompt, bytes, endpoint, credential, raw body, or stack;
- request IDs are present, valid, and do not encode user data;
- provider-body rejection, answer truncation, Unicode-boundary handling, and `ANSWER_TRUNCATED`
  behavior.

## Provider contract matrix

Use a local HTTP server bound to loopback and a deterministic fake clock/random source.

- request path, method, content type, model, safety system message, prompt, data URL, `max_tokens`,
  and optional bearer header;
- no authorization header when key is absent;
- redirect is rejected without following the destination;
- string and supported text-part response content;
- empty, missing, malformed, non-JSON, oversized, and slowly streamed responses;
- 400/401/403/404 without retry;
- 408/429/502/503/504 with bounded retry;
- other 4xx/5xx mapping;
- valid and invalid `Retry-After`, jitter bounds, attempt count, and overall deadline;
- cancellation during request and backoff;
- usage extraction only for non-negative integer values;
- canary secrets inserted into URL, key, prompt, and body never appear in result/log snapshots.

## MCP integration matrix

Spawn the built CLI with separate stdin/stdout/stderr pipes and connect with the official MCP
client.

- initialization and protocol negotiation;
- deterministic single-tool discovery and exact metadata/schema;
- successful call returns one readable text block and schema-valid structured content;
- failed call sets `isError: true` and returns schema-valid sanitized error content;
- unknown fields and invalid arguments are rejected;
- cancellation propagates and leaves the next call healthy;
- bounded parallel calls, queue full behavior, and clean shutdown;
- stdout parses entirely as MCP traffic; all diagnostics are on stderr;
- startup configuration failure exits non-zero before accepting protocol input;
- `--provider qwen|deepseek` initializes and lists the Tool with the selected environment-key
  fallback while an invalid profile exits before emitting protocol stdout;
- a 2025-era compatibility handshake is included if the official v2 SDK test client supports it
  without legacy server code.

## Host compatibility matrix

Run before a v0.1.0 release using the packed artifact, not the source checkout.

| Host        | Configuration                                        | Smoke scenarios                                                                                |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Claude Code | documented user-level and project-level stdio launch | tool discovery; chart question; OCR-style question; denied path; cancellation/provider failure |
| Codex       | documented project/user stdio MCP configuration      | same fixture and prompt set; structured result visible; stderr does not corrupt startup        |

Record host version, Node version, operating system, package digest, provider type (local fake/local
real/remote real), result, and sanitized failure evidence. Do not publish keys, personal paths,
images, or complete provider payloads.

At least one release-candidate smoke run uses a local OpenAI-compatible endpoint. Before Issue #16
is accepted for release, both documented profiles require a user-authorized remote smoke test with
non-sensitive synthetic chart/OCR fixtures, and at least one Claude Code and one Codex entry must
launch the packed artifact with `--provider`. Natural-language answers are reviewed for capability,
not asserted byte-for-byte.

On macOS, validate the actual Keychain boundary separately with a generated canary under an isolated
test service name: write interactively, check existence without revealing it, read and compare it in
memory, delete the exact item, and confirm it is absent. The cleanup result is part of the sanitized
test record. Never overwrite or read a user's production `qwen` or `deepseek` item for this check.

## CI design

### Pull-request fast layer

Run formatting check, ESLint, TypeScript checking, unit/provider-contract tests, build, packed-file
inspection, credential scan, and dependency review where available. The goal is actionable feedback
in minutes, not a hard-coded duration promise.

### Full validation layer

Run stdio integration, supported Node LTS matrix, supported operating-system matrix needed by
`sharp`, security fixtures, and clean tarball install. Slow compatibility tests may be separated but
remain required for release.

### Main and release layers

Main rebuilds and verifies the authoritative tarball. Release consumes that same artifact, records
SHA-256, generates an ecosystem-appropriate SBOM and provenance/attestation when platform support is
available, then performs clean install and host smoke tests before publishing.

Do not rebuild a different tarball during release promotion.

### Workflow security

- Default `GITHUB_TOKEN` permissions are read-only; jobs receive only specific required writes.
- Third-party Actions and reusable workflows are pinned to full commit SHAs and reviewed before
  adoption.
- Untrusted pull-request code does not run in privileged `pull_request_target` or `workflow_run`
  contexts.
- Public pull requests do not receive repository or provider secrets.
- Cache keys and downloaded artifacts do not cross trust boundaries without digest validation.

## Local quality commands

The scaffold Issue should provide scripts with these stable intentions:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm pack:check
pnpm audit:prod
```

CI invokes the same scripts rather than duplicating behavior in workflow YAML.

Package tests and host examples must use the scoped distribution name selected by the scaffold
Issue. They must never install or invoke the unrelated unscoped `sight-mcp` package.

## Coverage and flaky tests

- Collect branch and line coverage to identify gaps; do not invent a repository-wide threshold
  before a baseline exists.
- Security decisions, schema discriminants, error mappings, retry branches, and redaction branches
  require direct tests regardless of aggregate percentage.
- A flaky required test is a defect. Temporary quarantine requires an Issue, owner, reason,
  compensating check, and expiry date; retry-after-pass is not treated as healthy.

## Release acceptance

- [ ] Fast and full CI layers pass on the release commit.
- [ ] No known unreviewed failure exists in security-critical branches.
- [ ] Packed contents contain only intended runtime, documentation, license, and metadata files.
- [ ] Clean install and CLI launch succeed from the tarball.
- [ ] Claude Code and Codex smoke records pass against the same artifact digest.
- [ ] Dependency, license, secret, and vulnerability checks are reviewed.
- [ ] SBOM/provenance policy is satisfied or a documented platform limitation is recorded.
- [ ] Release notes include known limitations, privacy behavior, supported formats, configuration,
      upgrade, and rollback instructions.

## Rollback and forward fix

Before publication, reject the candidate and fix forward on a new commit. After publication, do not
overwrite an npm version. Deprecate the affected version, document impact, publish a corrected patch
from reviewed source, and preserve the original artifact and audit record.
