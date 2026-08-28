# Sight MCP

Sight MCP is a planned Model Context Protocol server that gives text-only models in Claude Code, Codex, and other MCP hosts access to a separately configured vision model.

> [!IMPORTANT]
> The project is in the design phase. No runnable server has been released yet.

## v0.1.0 direction

The first release will expose one stdio MCP tool:

```text
analyze_image(path, prompt)
```

The server will authorize and preprocess a local image, send the normalized image to an OpenAI-compatible vision endpoint, and return both readable text and structured metadata. Local model gateways and remote providers use the same adapter contract.

## Design documents

- [v0.1.0 proposal and full specification](docs/proposals/0001-sight-mcp-v0.1.0.md)
- [Runtime and architecture ADR](docs/adr/0001-runtime-and-architecture.md)
- [Vision tool and provider contract](docs/specs/vision-tool-contract.md)
- [Configuration specification](docs/specs/configuration.md)
- [Threat model](docs/security/threat-model.md)
- [Test and delivery strategy](docs/testing/strategy.md)

Project planning is tracked in [Issue #1](https://github.com/Weiki886/sight-mcp/issues/1) and the [`v0.1.0 — MVP`](https://github.com/Weiki886/sight-mcp/milestone/1) milestone.

## License

[MIT](LICENSE)
