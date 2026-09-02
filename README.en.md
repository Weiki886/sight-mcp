<div align="center">

# Sight MCP

**Give your text-only agent eyes.** A secure Model Context Protocol (MCP) vision bridge that adds
image recognition to Claude Code, Codex, and any stdio MCP host — without handing the model an
unrestricted file reader.

[![npm version](https://img.shields.io/npm/v/@weiki/sight-mcp)](https://www.npmjs.com/package/@weiki/sight-mcp)
[![npm monthly downloads](https://img.shields.io/npm/dm/@weiki/sight-mcp)](https://www.npmjs.com/package/@weiki/sight-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@weiki/sight-mcp)](https://nodejs.org/)
[![CI](https://github.com/Weiki886/sight-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Weiki886/sight-mcp/actions/workflows/ci.yml)

**语言 / Language：** [中文](README.md) · English

**Contents:** [Quick Start](#quick-start) · [Features](#features) · [Installation](#installation) ·
[Provider Setup](#provider-setup) · [Claude Code](#claude-code-configuration) ·
[Codex](#codex-configuration) · [Tools](#tools) · [Configuration](#configuration) ·
[Privacy](#privacy-and-provider-data-flow) · [Error Codes](#error-codes) ·
[Troubleshooting](#troubleshooting) · [Development](#development) · [Docs](#design-documents)

</div>

---

Sight MCP exposes two read-only image tools: `analyze_image` for an authorized local PNG, JPEG, or
WebP file, and `analyze_clipboard_image` for a one-click-confirmed image already on the macOS system
clipboard. The server validates the path, removes metadata, bounds and normalizes the image in
memory, then sends the pixels and question to one operator-configured OpenAI-compatible vision
endpoint.

## Quick Start

```sh
# 1. Save your provider key once (macOS Keychain; prompts interactively, never in shell history)
npx -y @weiki/sight-mcp@0.1.0 credentials set qwen

# 2. Register the server with your host and pick a provider (see the snippets below).

# 3. Ask the model about an image:
#    analyze_image(path="/absolute/path/to/image.png", prompt="Summarize this screenshot")
```

Then restart your host and run `/mcp` to confirm both tools appear. On macOS you can also copy an
image to the clipboard and call `analyze_clipboard_image(prompt)` without any path.

## Features

- **Read-only by design** — two narrowly-scoped tools with no arbitrary file reader, shell, or
  network access granted to the model.
- **Safe file access** — absolute-path validation against `SIGHT_ALLOWED_ROOTS`, canonicalization,
  and symlink-aware boundary checks before any bytes are read.
- **One-time out-of-root authorization (macOS)** — when an `analyze_image` path falls outside
  `SIGHT_ALLOWED_ROOTS`, a one-time native confirmation dialog is shown and the file is read only
  after approval; refusing returns `PATH_ACCESS_DENIED`.
- **In-memory processing** — `analyze_image` makes no temporary copies; images are stripped of
  metadata, orientation-corrected, and resized without enlargement in RAM before transmission.
- **One-click clipboard reading (macOS)** — `analyze_clipboard_image` asks for explicit native
  consent, then deletes its staging file on every exit path.
- **Bundled domestic providers** — `--provider qwen` (Qwen 3.8 Flash) and `--provider deepseek`
  (DeepSeek V4 Flash Vision Exp) as one fixed, reviewed endpoint + model pair.
- **Keychain-first credentials** — store keys outside host config and shell history on macOS; stay
  portable via environment variables on Linux, Windows, and CI.
- **Fail-closed and observable** — no silent provider/endpoint fallback, no redirect following,
  redacted structured logs, and stable error codes that never leak paths, keys, or raw bodies.
- **Production-minded delivery** — TypeScript with strict lint/typecheck, unit/contract/security/
  integration tests, package-content and license audits, and npm provenance attestation.

## Installation

- Node.js 22 or newer
- An OpenAI-compatible endpoint with a vision-capable model (local or remote)
- macOS for native Keychain storage; environment-based configuration remains portable

After v0.1.0 is published, hosts should run the immutable scoped version:

```sh
npx -y @weiki/sight-mcp@0.1.0
```

The unrelated unscoped `sight-mcp` package is not this project. During release-candidate testing,
install and invoke the generated `.tgz` instead of substituting another package name.

## Provider Setup

Store each remote Provider key once in macOS Keychain. The system command prompts for the secret
directly, so the key does not appear in the command, shell history, MCP host configuration, or a
repository `.env` file:

```sh
npx -y @weiki/sight-mcp@0.1.0 credentials set qwen
npx -y @weiki/sight-mcp@0.1.0 credentials set deepseek
npx -y @weiki/sight-mcp@0.1.0 credentials status
```

Only configure the Provider you use. `credentials status [qwen|deepseek]` reports `configured` or
`missing` without reading the stored password. To remove one item, run
`credentials delete qwen|deepseek`; deletion asks for confirmation unless `--yes` is explicit.

Start the server with `--provider qwen` or `--provider deepseek`. The profile binds the reviewed API
root, model, default reasoning effort, and matching Keychain account. Switching the argument and
restarting the host switches Provider; Sight MCP never falls back automatically.

## Claude Code configuration

Claude Code supports local stdio servers at local, project, and user scopes. A project configuration
is `.mcp.json` in the project root. On macOS, the recommended profile configuration contains no API
key:

```json
{
  "mcpServers": {
    "sight-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@weiki/sight-mcp@0.1.0", "--provider", "qwen"],
      "env": {
        "SIGHT_ALLOWED_ROOTS": "/absolute/path/to/allowed/images"
      }
    }
  }
}
```

For a private user-scoped entry, pass the same server object to
`claude mcp add-json --scope user sight-mcp '<json>'`. Verify with `claude mcp get sight-mcp`,
`claude mcp list`, or `/mcp`. See the
[official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) for current scope and
CLI behavior.

## Codex configuration

Codex reads user configuration from `~/.codex/config.toml`; a trusted project may instead use
`.codex/config.toml`. On macOS, select the profile in `args` and leave the credential in Keychain:

```toml
[mcp_servers.sight-mcp]
command = "npx"
args = ["-y", "@weiki/sight-mcp@0.1.0", "--provider", "qwen"]
startup_timeout_sec = 20
tool_timeout_sec = 70

[mcp_servers.sight-mcp.env]
SIGHT_ALLOWED_ROOTS = "/absolute/path/to/allowed/images"
```

Use `codex mcp list` to verify discovery and `/mcp` inside Codex to inspect the connection. The tool
timeout is intentionally slightly longer than Sight MCP's default 60-second internal deadline. See
the [official Codex MCP documentation](https://developers.openai.com/codex/mcp) for current user and
project configuration behavior.

## Tools

```text
analyze_image(path, prompt)
analyze_clipboard_image(prompt)   (macOS only)
```

- `path` must be an absolute path. Paths inside `SIGHT_ALLOWED_ROOTS` are read directly; on macOS,
  paths outside the roots trigger a one-time native authorization dialog before they are read. For
  images the user pasted directly, prefer `analyze_clipboard_image`.
- `prompt` is a non-empty question of at most 8,000 characters.
- `analyze_clipboard_image` reads the image currently on the system clipboard after a native
  one-click confirmation dialog. It takes no path, so `SIGHT_ALLOWED_ROOTS` does not apply, and the
  host cannot change the source. On a non-macOS system it returns `CLIPBOARD_UNAVAILABLE` without
  invoking a helper.
- A success returns readable text plus structured media/provider metadata.
- A failure sets MCP `isError: true` and returns a stable code without the path, prompt, key,
  endpoint, image bytes, raw Provider body, or stack.
- Text found in an image and Provider output remain untrusted data; hosts must not execute it as an
  instruction.

## Configuration

| Variable                            | Default    | Purpose                                                        |
| ----------------------------------- | ---------- | -------------------------------------------------------------- |
| `SIGHT_ALLOWED_ROOTS`               | server cwd | Platform-delimited absolute directories eligible for image use |
| `SIGHT_MAX_IMAGE_BYTES`             | `20971520` | Maximum source bytes read                                      |
| `SIGHT_MAX_IMAGE_PIXELS`            | `40000000` | Maximum decoded pixels                                         |
| `SIGHT_MAX_IMAGE_DIMENSION`         | `12000`    | Maximum decoded width or height                                |
| `SIGHT_TRANSMIT_MAX_DIMENSION`      | `2048`     | Maximum normalized width or height, without enlargement        |
| `SIGHT_MAX_TRANSMIT_BYTES`          | `10485760` | Maximum normalized image bytes                                 |
| `SIGHT_JPEG_QUALITY`                | `85`       | Opaque JPEG quality, from 40 through 95                        |
| `SIGHT_PROVIDER_BASE_URL`           | required*  | Provider API root; HTTPS remote or HTTP exact loopback         |
| `SIGHT_PROVIDER_MODEL`              | required*  | Configured vision model identifier                             |
| `SIGHT_PROVIDER_API_KEY`            | unset      | Optional Bearer credential inherited from the host             |
| `SIGHT_QWEN_API_KEY`                | unset      | Optional `--provider qwen` environment credential              |
| `SIGHT_DEEPSEEK_API_KEY`            | unset      | Optional `--provider deepseek` environment credential          |
| `SIGHT_PROVIDER_REASONING_EFFORT`   | unset      | Optional `low`, `medium`, `high`, `xhigh`, or `max`            |
| `SIGHT_REQUEST_TIMEOUT_MS`          | `60000`    | Overall Tool deadline, including queue and Provider retries    |
| `SIGHT_PROVIDER_MAX_TOKENS`         | `4096`     | Provider answer-token request cap                              |
| `SIGHT_MAX_PROVIDER_RESPONSE_BYTES` | `1048576`  | Maximum Provider response bytes                                |
| `SIGHT_MAX_OUTPUT_CHARS`            | `32000`    | Maximum returned answer characters                             |
| `SIGHT_MAX_CONCURRENCY`             | `2`        | Maximum simultaneously active analyses                         |
| `SIGHT_MAX_QUEUE_SIZE`              | `8`        | Maximum waiting analyses; zero disables queueing               |
| `SIGHT_MAX_RETRIES`                 | `2`        | Retries after the initial eligible Provider attempt            |
| `SIGHT_LOG_LEVEL`                   | `info`     | `silent`, `error`, `warn`, `info`, or `debug`                  |

Allowed roots must already exist and are canonicalized at startup. Use `:` between roots on macOS
and Linux, and `;` on Windows. Avoid broad roots such as an entire home directory. PNG, JPEG, and
WebP are recognized from content rather than filename extension. Animated or unsupported formats are
rejected. Images are orientation-corrected, stripped of metadata, resized without enlargement, and
encoded as JPEG when opaque or PNG when transparency is required.

`*` `SIGHT_PROVIDER_BASE_URL` and `SIGHT_PROVIDER_MODEL` are required only in generic no-argument
mode. A built-in `--provider` profile supplies both as one fixed pair.

### Recommended domestic vision Providers

Use the Qwen 3.8 Flash profile as the primary Provider:

```text
--provider qwen
```

Use DeepSeek V4 Flash Vision Exp as a manually selected alternative:

```text
--provider deepseek
```

The profiles use `https://dashscope.aliyuncs.com/compatible-mode/v1` with `qwen3.8-flash`, and
`https://api.deepseek.com` with `deepseek-v4-flash-vision-exp`; both default to `low` reasoning
effort. Keychain is preferred on macOS. For Linux, Windows, CI, or a deliberately ephemeral
override, set `SIGHT_QWEN_API_KEY`, `SIGHT_DEEPSEEK_API_KEY`, or the higher-precedence generic
`SIGHT_PROVIDER_API_KEY` in the host process environment. Never paste a real key into a tracked
`.mcp.json`, `config.toml`, `.env`, shell script, Issue, or log.

Generic no-argument mode remains available for a local or another OpenAI-compatible endpoint:

```text
SIGHT_PROVIDER_BASE_URL=http://127.0.0.1:11434/v1
SIGHT_PROVIDER_MODEL=your-vision-model
SIGHT_PROVIDER_API_KEY=optional-for-local-endpoints
```

### Migrating from `.env` or host-managed plaintext

1. Run `credentials set qwen` and/or `credentials set deepseek` from an interactive terminal.
2. Confirm the intended entries with `credentials status`.
3. Add `--provider qwen` or `--provider deepseek` to the host's server arguments.
4. Remove the API key and generic Provider URL/model from the host entry, then restart the host.
5. After successful Tool discovery and one synthetic-image call, securely remove old plaintext
   copies from `.env`, shell scripts, clipboard managers, and configuration backups you control.

Do not delete the old copy until the Keychain-backed startup has been verified. If rollback is
needed, remove `--provider` and restore the previous environment-only configuration.

## Privacy and Provider data flow

| Provider location     | Data that leaves the Sight MCP process                                |
| --------------------- | --------------------------------------------------------------------- |
| exact loopback        | normalized visible pixels and prompt stay on the local machine        |
| remote HTTPS endpoint | normalized visible pixels and prompt are transmitted to that Provider |

File paths, source filenames, metadata, credentials, and raw Provider responses are not sent in the
Provider request. Visible image content can still contain sensitive information. For remote
Providers, retention, training, access, jurisdiction, cost, and deletion policies are the operator's
responsibility.

`analyze_clipboard_image` stages the clipboard image in a user-private temporary file
(`~/Library/Caches/Sight MCP/inbox`, mode `0700`) only long enough to read it, then deletes it in
every exit path. The clipboard itself is never modified, and the temporary path and bytes are never
logged or returned.

Sight MCP never follows redirects or silently switches endpoints. It retries only connection
failures and HTTP 408, 429, 502, 503, or 504, within the overall deadline and configured retry cap.
Host cancellation propagates to queued work and the Provider request. Operational logs are redacted
structured JSON on stderr; stdout is reserved exclusively for MCP protocol traffic.

## Error codes

| Category           | Codes                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| input/path/file    | `INVALID_INPUT`, `PATH_ACCESS_DENIED`, `PATH_NOT_ABSOLUTE`, `PATH_NOT_ALLOWED`, `FILE_NOT_FOUND`, `FILE_NOT_REGULAR`, `FILE_TOO_LARGE`          |
| clipboard          | `CLIPBOARD_ACCESS_DENIED`, `CLIPBOARD_NO_IMAGE`, `CLIPBOARD_READ_FAILED`, `CLIPBOARD_UNAVAILABLE`                                               |
| image              | `UNSUPPORTED_MEDIA`, `IMAGE_TOO_LARGE`, `IMAGE_DECODE_FAILED`                                                                                   |
| capacity/lifecycle | `QUEUE_FULL`, `CANCELLED`, `INTERNAL_ERROR`                                                                                                     |
| Provider/output    | `PROVIDER_AUTHENTICATION`, `PROVIDER_RATE_LIMITED`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`, `OUTPUT_TOO_LARGE` |

Only `QUEUE_FULL`, `PROVIDER_RATE_LIMITED`, `PROVIDER_TIMEOUT`, and `PROVIDER_UNAVAILABLE` are
reported as retryable. The server itself already performs its configured bounded Provider retries;
hosts should avoid immediate unbounded retry loops.

## Troubleshooting

- **Server is disconnected:** run the host's MCP list/get command. Confirm Node 22+, the scoped
  package name, and either a valid `--provider` profile or both generic Provider variables.
- **Profile credential is missing:** run `credentials status qwen|deepseek`, then run
  `credentials set qwen|deepseek` from an interactive macOS terminal. On another operating system,
  inject the selected profile's environment variable.
- **Keychain lookup fails:** unlock the login Keychain and retry. Sight MCP fails closed and does
  not switch Providers or credentials.
- **Startup exits immediately:** allowed roots must be existing absolute directories; non-loopback
  HTTP endpoints are rejected and must use HTTPS.
- **`PATH_NOT_ALLOWED`:** pass an absolute canonical path under a narrow allowed root. Symlinks do
  not bypass the boundary.
- **`PATH_ACCESS_DENIED`:** the one-time authorization dialog on macOS was denied or cancelled.
  Retry the tool and choose Allow when it appears.
- **`CLIPBOARD_ACCESS_DENIED`:** the confirmation dialog was cancelled or denied. Retry the tool and
  choose Allow when it appears.
- **`CLIPBOARD_NO_IMAGE`:** copy a PNG, JPEG, or WebP image to the clipboard first, then retry.
- **`CLIPBOARD_UNAVAILABLE`:** clipboard reading is macOS-only in v0.1.0. Use `analyze_image` with a
  saved file on other platforms.
- **Clipboard confirmation does not appear or `CLIPBOARD_READ_FAILED`:** confirm accessibility
  permissions (System Settings → Privacy & Security → Automation) let the host control the system
  dialog, then retry.
- **`PROVIDER_AUTHENTICATION`:** replace the selected Keychain item or exported environment key.
  Never add it to a tracked configuration file.
- **`PROVIDER_TIMEOUT` or `PROVIDER_UNAVAILABLE`:** verify the model supports images and that the
  configured API root does not already end in `/chat/completions`.
- **Protocol parse/startup errors:** stdout must remain untouched. Inspect the server's stderr via
  `claude --debug mcp`, the Claude `/mcp` panel, or Codex logs.
- **Native `sharp` installation failure:** confirm a supported Node/OS/architecture combination and
  reinstall from a clean directory rather than copying `node_modules` across platforms.

## Development

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run ci
pnpm release:candidate -- --output artifacts/release-candidate
```

The release-candidate command builds and packs once, records SHA-256 and source commit, installs the
same tarball into an empty temporary directory, exercises discovery/chart/OCR-style/denied-path/
Provider-failure/cancellation scenarios, and generates a CycloneDX SBOM with `npm sbom`. CI uploads
those files as one artifact; a `main` run also creates GitHub build provenance for the exact `.tgz`.

Additional release evidence and the manual Host matrix are documented in
[the v0.1.0 release runbook](docs/release/process.en.md). Formal npm publish, Git tag, and GitHub
Release remain separate human-approved steps.

## Contributing

Issues and pull requests are welcome. Open an issue first for anything beyond a small fix so the
scope and design can be agreed on before code.

## Design documents

- [v0.1.0 proposal and full specification](docs/proposals/0001-sight-mcp-v0.1.0.en.md)
- [Runtime and architecture ADR](docs/adr/0001-runtime-and-architecture.en.md)
- [macOS Keychain and Provider profiles ADR](docs/adr/0002-macos-keychain-provider-profiles.en.md)
- [One-click clipboard image reading ADR](docs/adr/0003-clipboard-image-reading.en.md)
- [Vision tool and Provider contract](docs/specs/vision-tool-contract.en.md)
- [Configuration specification](docs/specs/configuration.en.md)
- [Threat model](docs/security/threat-model.en.md)
- [OpenAI-compatible Provider](docs/providers/openai-compatible.en.md)
- [Test and delivery strategy](docs/testing/strategy.en.md)
- [v0.1.0 release notes](docs/release/v0.1.0.en.md)

## License

[MIT](LICENSE)
