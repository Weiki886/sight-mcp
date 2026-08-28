# Sight MCP

Sight MCP is a secure vision bridge for text-only MCP hosts such as Claude Code and Codex.

> [!IMPORTANT] The current branch implements only the TypeScript and MCP stdio foundation tracked by
> [Issue #2](https://github.com/Weiki886/sight-mcp/issues/2). It intentionally exposes no tools and
> cannot analyze images yet.

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

## Roadmap

The accepted v0.1.0 design is tracked in [Issue #1](https://github.com/Weiki886/sight-mcp/issues/1).
Secure local image handling, an OpenAI-compatible vision provider, and the `analyze_image` tool will
be delivered by subsequent issues.

## License

[MIT](./LICENSE)
