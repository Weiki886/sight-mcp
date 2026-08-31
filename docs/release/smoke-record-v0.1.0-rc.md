# v0.1.0 release-candidate smoke record

- Executed: 2026-08-31 (Asia/Shanghai)
- Package: `@weiki886/sight-mcp@0.1.0`
- Candidate implementation commit: `621d42418b8b584e3067f2def30f73397b248ca6`
- Candidate file: `weiki886-sight-mcp-0.1.0.tgz`
- SHA-256: `fdbf97569c73803eb55aaaeeb1765e181c1cf4f8c66829bae66e709cb436d8e5`
- Provider: local synthetic OpenAI-compatible endpoint; no Provider credential
- Fixture: generated synthetic PNG; no personal or repository image

## Automated clean-install record

The authoritative CI candidate was built and installed into an empty temporary npm project on
Node.js v22.23.2, Linux x64. The official MCP client connected to the packed executable, and stdout
was successfully parsed as MCP traffic.

| Scenario                     | Result |
| ---------------------------- | ------ |
| clean install / executable   | passed |
| Tool discovery               | passed |
| chart-style call             | passed |
| OCR-style call               | passed |
| denied path                  | passed |
| Provider failure mapping     | passed |
| active cancellation          | passed |
| call after cancellation      | passed |
| stderr path/prompt redaction | passed |

The same run generated `sight-mcp-0.1.0.sbom.cdx.json` with `npm sbom` and recorded the candidate
digest/source commit in `release-manifest.json`.

## Real Host matrix

Both Hosts installed and launched the same candidate digest. Each used an isolated configuration and
the same local synthetic Provider behavior.

| Host        | Host version          | Node.js | Operating system    | Discovery | Chart  | OCR style | Denied path | Provider failure | Cancellation |
| ----------- | --------------------- | ------- | ------------------- | --------- | ------ | --------- | ----------- | ---------------- | ------------ |
| Claude Code | 2.1.228 (Claude Code) | v26.3.1 | Darwin 25.5.0 arm64 | passed    | passed | passed    | passed      | passed           | passed       |
| Codex       | codex-cli 0.146.0     | v26.3.1 | Darwin 25.5.0 arm64 | passed    | passed | passed    | passed      | passed           | passed       |

For cancellation, the runner interrupted each Host only after the synthetic Provider observed the
in-flight request, then verified that the Host closed that Provider response. Raw Host output was
discarded.

This record intentionally excludes credentials, personal paths, fixture bytes, raw image/model
output, complete prompts, Provider request bodies, stdout/stderr captures, and temporary-directory
names. Formal npm publish, Tag, and GitHub Release were not performed.
