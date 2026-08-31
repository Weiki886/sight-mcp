# Sight MCP

Sight MCP is a secure Model Context Protocol vision bridge for text-only models in Claude Code,
Codex, and other stdio MCP hosts. It exposes one read-only `analyze_image` tool for an authorized
local PNG, JPEG, or WebP image.

The server validates the path, removes metadata, bounds and normalizes the image in memory, then
sends the pixels and question to one operator-configured OpenAI-compatible vision endpoint. It never
grants the language model an unrestricted file reader.

## Requirements and installation

- Node.js 22 or newer
- An OpenAI-compatible endpoint with a vision-capable model (local or remote)

After v0.1.0 is published, hosts should run the immutable scoped version:

```sh
npx -y @weiki886/sight-mcp@0.1.0
```

The unrelated unscoped `sight-mcp` package is not this project. During release-candidate testing,
install and invoke the generated `.tgz` instead of substituting another package name.

## Claude Code configuration

Claude Code supports local stdio servers at local, project, and user scopes. A project configuration
is `.mcp.json` in the project root; use only placeholders or environment expansion in a committed
file:

```json
{
  "mcpServers": {
    "sight-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@weiki886/sight-mcp@0.1.0"],
      "env": {
        "SIGHT_ALLOWED_ROOTS": "/absolute/path/to/allowed/images",
        "SIGHT_PROVIDER_BASE_URL": "http://127.0.0.1:11434/v1",
        "SIGHT_PROVIDER_MODEL": "your-vision-model",
        "SIGHT_PROVIDER_API_KEY": "${SIGHT_PROVIDER_API_KEY}"
      }
    }
  }
}
```

For a private user-scoped entry, pass the same server object to
`claude mcp add-json --scope user sight-mcp '<json>'`. Export `SIGHT_PROVIDER_API_KEY` in the
environment that launches Claude Code; do not place a real key in `.mcp.json`, shell history, or the
repository. Verify with `claude mcp get sight-mcp`, `claude mcp list`, or `/mcp`. See the
[official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) for current scope and
CLI behavior.

## Codex configuration

Codex reads user configuration from `~/.codex/config.toml`; a trusted project may instead use
`.codex/config.toml`. Keep the credential in the launching environment and inherit it with
`env_vars`:

```toml
[mcp_servers.sight-mcp]
command = "npx"
args = ["-y", "@weiki886/sight-mcp@0.1.0"]
env_vars = ["SIGHT_PROVIDER_API_KEY"]
startup_timeout_sec = 20
tool_timeout_sec = 70

[mcp_servers.sight-mcp.env]
SIGHT_ALLOWED_ROOTS = "/absolute/path/to/allowed/images"
SIGHT_PROVIDER_BASE_URL = "http://127.0.0.1:11434/v1"
SIGHT_PROVIDER_MODEL = "your-vision-model"
```

Use `codex mcp list` to verify discovery and `/mcp` inside Codex to inspect the connection. The tool
timeout is intentionally slightly longer than Sight MCP's default 60-second internal deadline. See
the [official Codex MCP documentation](https://developers.openai.com/codex/mcp) for current user and
project configuration behavior.

## Tool

```text
analyze_image(path, prompt)
```

- `path` must be an absolute path inside one of `SIGHT_ALLOWED_ROOTS` after canonical resolution.
- `prompt` is a non-empty question of at most 8,000 characters.
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
| `SIGHT_PROVIDER_BASE_URL`           | required   | Provider API root; HTTPS remote or HTTP exact loopback         |
| `SIGHT_PROVIDER_MODEL`              | required   | Configured vision model identifier                             |
| `SIGHT_PROVIDER_API_KEY`            | unset      | Optional Bearer credential inherited from the host             |
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

## Privacy and Provider data flow

| Provider location     | Data that leaves the Sight MCP process                                |
| --------------------- | --------------------------------------------------------------------- |
| exact loopback        | normalized visible pixels and prompt stay on the local machine        |
| remote HTTPS endpoint | normalized visible pixels and prompt are transmitted to that Provider |

File paths, source filenames, metadata, credentials, and raw Provider responses are not sent in the
Provider request. Visible image content can still contain sensitive information. For remote
Providers, retention, training, access, jurisdiction, cost, and deletion policies are the operator's
responsibility.

Sight MCP never follows redirects or silently switches endpoints. It retries only connection
failures and HTTP 408, 429, 502, 503, or 504, within the overall deadline and configured retry cap.
Host cancellation propagates to queued work and the Provider request. Operational logs are redacted
structured JSON on stderr; stdout is reserved exclusively for MCP protocol traffic.

## Error codes

| Category           | Codes                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| input/path/file    | `INVALID_INPUT`, `PATH_NOT_ABSOLUTE`, `PATH_NOT_ALLOWED`, `FILE_NOT_FOUND`, `FILE_NOT_REGULAR`, `FILE_TOO_LARGE`                                |
| image              | `UNSUPPORTED_MEDIA`, `IMAGE_TOO_LARGE`, `IMAGE_DECODE_FAILED`                                                                                   |
| capacity/lifecycle | `QUEUE_FULL`, `CANCELLED`, `INTERNAL_ERROR`                                                                                                     |
| Provider/output    | `PROVIDER_AUTHENTICATION`, `PROVIDER_RATE_LIMITED`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`, `OUTPUT_TOO_LARGE` |

Only `QUEUE_FULL`, `PROVIDER_RATE_LIMITED`, `PROVIDER_TIMEOUT`, and `PROVIDER_UNAVAILABLE` are
reported as retryable. The server itself already performs its configured bounded Provider retries;
hosts should avoid immediate unbounded retry loops.

## Troubleshooting

- **Server is disconnected:** run the host's MCP list/get command. Confirm Node 22+, the scoped
  package name, and that `SIGHT_PROVIDER_BASE_URL` and `SIGHT_PROVIDER_MODEL` are present.
- **Startup exits immediately:** allowed roots must be existing absolute directories; non-loopback
  HTTP endpoints are rejected and must use HTTPS.
- **`PATH_NOT_ALLOWED`:** pass an absolute canonical path under a narrow allowed root. Symlinks do
  not bypass the boundary.
- **`PROVIDER_AUTHENTICATION`:** export the key before launching the host. Never add it to a tracked
  configuration file.
- **`PROVIDER_TIMEOUT` or `PROVIDER_UNAVAILABLE`:** verify the model supports images and that the
  configured API root does not already end in `/chat/completions`.
- **Protocol parse/startup errors:** stdout must remain untouched. Inspect the server's stderr via
  `claude --debug mcp`, the Claude `/mcp` panel, or Codex logs.
- **Native `sharp` installation failure:** confirm a supported Node/OS/architecture combination and
  reinstall from a clean directory rather than copying `node_modules` across platforms.

## Development and release verification

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
[the v0.1.0 release runbook](docs/release/process.md). Formal npm publish, Git tag, and GitHub
Release remain separate human-approved steps.

## Design documents

- [v0.1.0 proposal and full specification](docs/proposals/0001-sight-mcp-v0.1.0.md)
- [Runtime and architecture ADR](docs/adr/0001-runtime-and-architecture.md)
- [Vision tool and Provider contract](docs/specs/vision-tool-contract.md)
- [Configuration specification](docs/specs/configuration.md)
- [Threat model](docs/security/threat-model.md)
- [OpenAI-compatible Provider](docs/providers/openai-compatible.md)
- [Test and delivery strategy](docs/testing/strategy.md)
- [v0.1.0 release notes](docs/release/v0.1.0.md)

## License

[MIT](LICENSE)
