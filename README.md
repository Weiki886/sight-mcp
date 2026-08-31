# Sight MCP

Sight MCP is a secure Model Context Protocol vision bridge for text-only models in Claude Code,
Codex, and other MCP hosts.

> [!IMPORTANT] The repository contains the TypeScript/MCP stdio server, secure local image
> preprocessing, an OpenAI-compatible Provider adapter, and the public `analyze_image` Tool. Host
> compatibility, packaging, and v0.1.0 release preparation remain tracked by Issue #6.

## v0.1.0 direction

The first release exposes one stdio MCP tool:

```text
analyze_image(path, prompt)
```

The server authorizes and preprocesses a local image, sends the normalized image to an
OpenAI-compatible vision endpoint, and returns both readable text and structured metadata. Local
model gateways and remote providers use the same adapter contract.

## Development

Requirements:

- Node.js 22 or newer
- pnpm 10.32.0 through Corepack

Install dependencies and run the complete local quality gate:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run ci
```

Start the built stdio server:

```sh
pnpm build
SIGHT_PROVIDER_BASE_URL=http://127.0.0.1:11434/v1 \
SIGHT_PROVIDER_MODEL=your-vision-model \
pnpm start
```

The server reserves stdout for MCP protocol messages. Operational diagnostics are written to stderr
as structured JSON.

## Current configuration

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
| `SIGHT_PROVIDER_API_KEY`            | unset      | Optional Bearer credential; use a host-managed secret          |
| `SIGHT_REQUEST_TIMEOUT_MS`          | `60000`    | Overall Tool deadline, including queue and Provider retries    |
| `SIGHT_PROVIDER_MAX_TOKENS`         | `4096`     | Provider answer-token request cap                              |
| `SIGHT_MAX_PROVIDER_RESPONSE_BYTES` | `1048576`  | Maximum Provider response bytes                                |
| `SIGHT_MAX_OUTPUT_CHARS`            | `32000`    | Maximum returned answer characters                             |
| `SIGHT_MAX_CONCURRENCY`             | `2`        | Maximum simultaneously active analyses                         |
| `SIGHT_MAX_QUEUE_SIZE`              | `8`        | Maximum waiting analyses; zero disables queueing               |
| `SIGHT_MAX_RETRIES`                 | `2`        | Retries after the initial eligible Provider attempt            |
| `SIGHT_LOG_LEVEL`                   | `info`     | `silent`, `error`, `warn`, `info`, or `debug`                  |

Allowed roots must already exist and are canonicalized at startup. PNG, JPEG, and WebP inputs are
recognized from their content rather than filename extensions. Images are normalized in memory,
orientation is applied, metadata is removed, and opaque/alpha output is encoded as JPEG/PNG.

Invalid values stop startup with a concise error and never echo environment contents or local paths.
Remote Providers receive the normalized image pixels and prompt. Sight MCP never silently switches
endpoints, and Provider-side retention, training, jurisdiction, and access policies remain the
operator's responsibility. Prefer an exact-loopback Provider when images must remain local.

## Design documents

- [v0.1.0 proposal and full specification](docs/proposals/0001-sight-mcp-v0.1.0.md)
- [Runtime and architecture ADR](docs/adr/0001-runtime-and-architecture.md)
- [Vision tool and provider contract](docs/specs/vision-tool-contract.md)
- [Configuration specification](docs/specs/configuration.md)
- [Threat model](docs/security/threat-model.md)
- [OpenAI-compatible Provider](docs/providers/openai-compatible.md)
- [Test and delivery strategy](docs/testing/strategy.md)

Project planning is tracked in the
[`v0.1.0 — MVP`](https://github.com/Weiki886/sight-mcp/milestone/1) milestone. Secure local image
handling, the OpenAI-compatible vision Provider, and the `analyze_image` Tool are implemented. Host
compatibility and release readiness remain before v0.1.0 publication.

## License

[MIT](LICENSE)
