# Sight MCP

Sight MCP is a secure Model Context Protocol vision bridge for text-only models in Claude Code,
Codex, and other MCP hosts.

> [!IMPORTANT] The repository currently contains the TypeScript and MCP stdio foundation tracked by
> [Issue #2](https://github.com/Weiki886/sight-mcp/issues/2). It intentionally exposes no tools and
> cannot analyze images yet.

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

## Configuration

The scaffold supports one optional environment variable:

| Variable          | Default | Values                                     |
| ----------------- | ------- | ------------------------------------------ |
| `SIGHT_LOG_LEVEL` | `info`  | `silent`, `error`, `warn`, `info`, `debug` |

Invalid values stop startup with a concise error and never echo environment contents.

## Design documents

- [v0.1.0 proposal and full specification](docs/proposals/0001-sight-mcp-v0.1.0.md)
- [Runtime and architecture ADR](docs/adr/0001-runtime-and-architecture.md)
- [Vision tool and provider contract](docs/specs/vision-tool-contract.md)
- [Configuration specification](docs/specs/configuration.md)
- [Threat model](docs/security/threat-model.md)
- [Test and delivery strategy](docs/testing/strategy.md)

Project planning is tracked in the
[`v0.1.0 — MVP`](https://github.com/Weiki886/sight-mcp/milestone/1) milestone. Secure local image
handling, an OpenAI-compatible vision provider, and the `analyze_image` tool will be delivered by
subsequent issues.

## License

[MIT](LICENSE)
