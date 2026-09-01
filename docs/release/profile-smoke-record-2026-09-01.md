# Provider profile and macOS Keychain smoke record

- Executed: 2026-09-01 (Asia/Shanghai)
- Scope: Issue #16 pre-merge validation; not a publication candidate
- Package: locally packed `@weiki886/sight-mcp@0.1.0`
- Package SHA-256: `cc0eba90a68e8a5d4a122af0b0a337a0ce0302aceeb8f2f0c82cad7a5e13ca1a`
- Fixture: generated synthetic chart PNG; no personal or repository image
- Credentials: user-authorized local credentials; values and request bodies not recorded

## macOS Keychain boundary

The real `/usr/bin/security` adapter was exercised under the isolated service
`dev.weiki886.sight-mcp.test.canary-20260901`, not the production service. A generated synthetic
35-byte canary was entered through the hidden system prompt and retyped as requested by macOS.

| Operation                                | Result |
| ---------------------------------------- | ------ |
| interactive set without a secret argv    | passed |
| exact-account status                     | passed |
| bounded read and in-memory digest        | passed |
| exact-account delete                     | passed |
| post-delete absence / cleanup            | passed |
| production Qwen/DeepSeek items untouched | passed |

The canary value is not retained in this record. Its read-back SHA-256 was compared during the run,
and cleanup returned both `deleted: true` and `absent: true`.

## Direct MCP profile validation

The built CLI was launched over stdio with the official MCP client and the new profile argument.
Both Providers analyzed the same synthetic image containing the title `Sight MCP Canary 2048`,
values Q1 12, Q2 28, Q3 19, and three corresponding bars.

| Profile    | Tool discovery | Image call | Exact title/values | Tallest bar |
| ---------- | -------------- | ---------- | ------------------ | ----------- |
| `qwen`     | passed         | passed     | passed             | Q2, passed  |
| `deepseek` | passed         | passed     | passed             | Q2, passed  |

One DeepSeek diagnostic run used an intentionally reduced `1024` answer-token cap and returned no
acceptable final answer after its reasoning output, so Sight MCP correctly reported
`PROVIDER_RESPONSE_INVALID`. The normal-budget run passed at `2048`; the Host runner uses `4096`.
The response validator was not weakened.

## Real Host profile matrix

Each Host installed and ran the same local tarball digest through an isolated configuration. The API
key was inherited from the authorized runner environment and was not written into the Host config,
server arguments, record, or output. Each Host discovered `analyze_image`, made one call, and
validated the synthetic title, values, and tallest bar.

| Host        | Host version          | Provider profile | Node.js | Operating system    | Discovery | Vision |
| ----------- | --------------------- | ---------------- | ------- | ------------------- | --------- | ------ |
| Claude Code | 2.1.228 (Claude Code) | `qwen`           | v26.3.1 | Darwin 25.5.0 arm64 | passed    | passed |
| Codex       | codex-cli 0.146.0     | `deepseek`       | v26.3.1 | Darwin 25.5.0 arm64 | passed    | passed |

The deterministic local Host matrix was also rerun on both Claude Code and Codex with this same
digest after the runner gained profile arguments. Discovery, chart, OCR-style, denied-path,
Provider-failure, and active-cancellation scenarios all passed, confirming that generic no-argument
mode and the existing Host runner remain compatible.

The sanitized machine-readable records are local ignored artifacts. Raw Host output was discarded.
No key, personal path, image bytes, complete prompt, Provider request/response body, or temporary
directory name is included here.

Because the source worktree was not yet merged when this record was produced, the release operator
must rebuild the immutable candidate from the reviewed `main` commit, regenerate its SBOM and
provenance, and rerun both the deterministic Host matrix and profile matrix before publication.
