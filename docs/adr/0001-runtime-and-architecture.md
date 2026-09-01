# ADR 0001: TypeScript runtime and provider-neutral stdio architecture

- Status: Accepted
- Accepted: 2026-08-28
- Date: 2026-08-28
- Amended: 2026-09-01; credential-source details are superseded by
  [ADR 0002](0002-macos-keychain-provider-profiles.md)
- Deciders: Weiki886
- Related: [Proposal 0001](../proposals/0001-sight-mcp-v0.1.0.md),
  [Issue #1](https://github.com/Weiki886/sight-mcp/issues/1)

## Context

Sight MCP must let a text-only model in Claude Code or Codex ask a separate vision model about a
local image. The first release needs predictable installation, current MCP support, strict external
contracts, safe image preprocessing, and a provider boundary that can evolve without changing the
MCP tool.

The implementation is primarily an MCP lifecycle, filesystem policy, image preprocessing, and HTTP
orchestration problem. It is not a model-training or local-inference runtime.

## Decision

### Runtime and language

Use TypeScript in strict mode, ESM modules, pnpm, and supported Node.js LTS releases. The package
will declare and test an explicit Node engine floor rather than silently depending on whichever
runtime happens to be installed.

Use the official MCP TypeScript SDK v2 server package. Do not use the v1 compatibility package in a
new project.

Use Zod v4 at external boundaries and derive TypeScript types from schemas when practical. Do not
maintain hand-written runtime schemas and separate, potentially divergent TypeScript interfaces for
the same public payload.

### Transport

Use stdio as the only v0.1.0 server transport. stdout is reserved for MCP frames; diagnostics are
written to stderr through a redacting logger.

Keep transport construction separate from application composition so a future Streamable HTTP
adapter can reuse the application without importing stdio details into domain modules.

### Public MCP surface

Expose one tool, `analyze_image`. Use closed Zod input and output schemas, an object-shaped
versioned structured result, and a text fallback.

Mark the tool as read-only and non-destructive, but not idempotent because repeated calls can create
provider cost. Mark it as open-world because it communicates with a separately operated provider.

### Internal boundaries

Use the following inward dependency direction:

```text
stdio entrypoint
  -> MCP tool adapter
    -> AnalyzeImage application service
      -> InputGuard port
      -> ImagePipeline port
      -> VisionProvider port
```

Infrastructure modules implement ports. Domain and application modules do not import MCP, `sharp`,
provider SDK, or Node transport types. Cross-boundary image bytes use `Uint8Array`; cancellation
uses the platform `AbortSignal`.

### Provider strategy

Define a provider-neutral `VisionProvider` interface and implement one OpenAI-compatible
`/chat/completions` adapter. Use platform HTTP primitives unless an SDK demonstrates necessary
compatibility or security value that cannot be achieved clearly without it.

Provider selection happens once at startup. The MCP call cannot choose an endpoint, model, API key,
or arbitrary header.

### Configuration

Use validated environment variables plus documented safe defaults in v0.1.0. Do not load credentials
implicitly from the repository or current directory. An explicit built-in Provider profile may use
the operating-system credential source defined by ADR 0002. Invalid required configuration fails
startup with redacted diagnostics.

### Image processing

Use `sharp` behind an `ImagePipeline` interface. Authorize and byte-limit the source before
decoding; then limit decoded pixels and dimensions, normalize orientation, remove metadata, resize
without enlargement, and encode a bounded provider payload.

## Consequences

### Positive

- The official SDK tracks the current protocol and provides stdio and output-schema support.
- npm/`npx` distribution matches how coding hosts commonly launch local MCP servers.
- TypeScript and Zod make tool, configuration, provider, and error contracts reviewable at compile
  time and runtime.
- Provider adapters can be added without renaming the public tool.
- Transport, image, provider, and MCP details can be tested independently.
- The first release has a small public surface and a clear privacy boundary.

### Negative

- Node and a package install are required; v0.1.0 is not a single native executable.
- `sharp` introduces a native dependency and supply-chain/packaging work across supported platforms.
- Generic environment-only configuration can be verbose in host configuration files; ADR 0002 adds
  an explicit macOS Keychain path for built-in profiles.
- OpenAI-compatible implementations vary in response details; the adapter must reject unsupported
  shapes instead of accumulating silent heuristics.
- stdio does not serve shared or remote clients.

### Risks

- New MCP v2 behavior may expose compatibility differences in older hosts. The object-shaped result
  and text fallback reduce this risk.
- Provider compatibility can tempt vendor-specific fields to leak into domain types. Contract tests
  and an adapter boundary prevent this.
- A native decoder expands attack surface. Strict limits, dependency review, minimal formats,
  fixtures, and timely upgrades are required.

## Rejected alternatives

- Python core: best reserved for future OCR, OpenCV, or local-model capabilities that justify a
  separate runtime.
- Plain JavaScript: insufficient compile-time protection for the number of public and
  security-sensitive boundaries.
- Go/Rust core: useful for a measured binary/startup requirement, but slower for the first
  MCP-compatible release.
- MCP SDK v1: legacy line; inappropriate for a new project targeting the current protocol.
- Direct provider calls in the tool handler: couples protocol code to vendor and makes deterministic
  tests harder.
- Multiple tools in v0.1.0: expands schemas and model selection behavior before the core bridge is
  validated.
- HTTP-first: adds a materially larger authentication, authorization, networking, and operations
  scope.

## Compliance

Implementation PRs conform to this ADR when:

- dependency direction matches the documented ports;
- no business logic or provider translation resides in the stdio entrypoint;
- no provider type appears in the MCP input or output;
- stdout contains only protocol traffic;
- all external inputs and outputs are runtime validated;
- provider and image implementations are replaceable in tests;
- deviations are recorded in a superseding ADR before merge.
