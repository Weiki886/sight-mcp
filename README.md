# Sight MCP

Sight MCP is a secure Model Context Protocol vision bridge for text-only models in Claude Code,
Codex, and other MCP hosts.

> [!IMPORTANT] The repository currently contains the TypeScript/MCP stdio foundation and the secure
> local-image preprocessing pipeline tracked by
> [Issue #3](https://github.com/Weiki886/sight-mcp/issues/3). It intentionally exposes no MCP tools
> and cannot call a vision provider yet.

## v0.1.0 direction

The first release will expose one stdio MCP tool:

```text
analyze_image(path, prompt)
```

The server will authorize and preprocess a local image, send the normalized image to an
OpenAI-compatible vision endpoint, and return both readable text and structured metadata. Local
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
pnpm start
```

The server reserves stdout for MCP protocol messages. Operational diagnostics are written to stderr
as structured JSON.

## Current configuration

| Variable                       | Default    | Purpose                                                        |
| ------------------------------ | ---------- | -------------------------------------------------------------- |
| `SIGHT_ALLOWED_ROOTS`          | server cwd | Platform-delimited absolute directories eligible for image use |
| `SIGHT_MAX_IMAGE_BYTES`        | `20971520` | Maximum source bytes read                                      |
| `SIGHT_MAX_IMAGE_PIXELS`       | `40000000` | Maximum decoded pixels                                         |
| `SIGHT_MAX_IMAGE_DIMENSION`    | `12000`    | Maximum decoded width or height                                |
| `SIGHT_TRANSMIT_MAX_DIMENSION` | `2048`     | Maximum normalized width or height, without enlargement        |
| `SIGHT_MAX_TRANSMIT_BYTES`     | `10485760` | Maximum normalized image bytes                                 |
| `SIGHT_JPEG_QUALITY`           | `85`       | Opaque JPEG quality, from 40 through 95                        |
| `SIGHT_LOG_LEVEL`              | `info`     | `silent`, `error`, `warn`, `info`, or `debug`                  |

Allowed roots must already exist and are canonicalized at startup. PNG, JPEG, and WebP inputs are
recognized from their content rather than filename extensions. Images are normalized in memory,
orientation is applied, metadata is removed, and opaque/alpha output is encoded as JPEG/PNG.

Invalid values stop startup with a concise error and never echo environment contents or local paths.
Provider variables in the full configuration specification become active with the provider adapter
milestone.

## Design documents

- [v0.1.0 proposal and full specification](docs/proposals/0001-sight-mcp-v0.1.0.md)
- [Runtime and architecture ADR](docs/adr/0001-runtime-and-architecture.md)
- [Vision tool and provider contract](docs/specs/vision-tool-contract.md)
- [Configuration specification](docs/specs/configuration.md)
- [Threat model](docs/security/threat-model.md)
- [Test and delivery strategy](docs/testing/strategy.md)

Project planning is tracked in the
[`v0.1.0 — MVP`](https://github.com/Weiki886/sight-mcp/milestone/1) milestone. Secure local image
handling is implemented locally; an OpenAI-compatible vision provider and the `analyze_image` tool
will be delivered by subsequent issues.

## License

[MIT](LICENSE)
