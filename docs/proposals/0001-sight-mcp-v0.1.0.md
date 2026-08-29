# Proposal 0001: Sight MCP v0.1.0

- Status: Accepted
- Accepted: 2026-08-28
- Date: 2026-08-28
- Owner: Weiki886
- Tracking: [Issue #1](https://github.com/Weiki886/sight-mcp/issues/1)
- Milestone: [`v0.1.0 — MVP`](https://github.com/Weiki886/sight-mcp/milestone/1)

## Users and scenario

The primary user runs Claude Code, Codex, or another MCP host with a text-only model. When a task
refers to a screenshot, diagram, chart, scanned document, or other image, the host model cannot
inspect the pixels itself.

Sight MCP supplies a narrow bridge:

1. The host model calls `analyze_image` with a local path and a question.
2. Sight MCP authorizes and validates the file.
3. Sight MCP normalizes the image within resource limits.
4. A configured vision provider analyzes the image.
5. Sight MCP returns readable text and a structured result to the text-only model.

The user selects and operates the vision endpoint. Sight MCP does not contain a model and does not
train or host one.

## Problem and value

Existing vision MCP servers prove the bridge pattern, but commonly optimize for only one of these
goals: small implementation size, broad media support, provider flexibility, or security. Sight MCP
should combine the useful parts without inheriting unsafe defaults or an oversized first release.

The v0.1.0 value is a dependable, reviewable path from a local image to a provider-neutral text
result that works the same way in Claude Code and Codex.

## Evidence from related projects

The design was informed by the following public projects:

- [Winterfellwen/vision-mcp](https://github.com/Winterfellwen/vision-mcp): image normalization, rate
  limiting, bounded retries, queueing, comparison, and OpenAI-compatible APIs.
- [joshsssn/mcp-vision-server](https://github.com/joshsssn/mcp-vision-server): a small stdio bridge
  and straightforward support for Ollama, LM Studio, vLLM, and remote OpenAI-compatible endpoints.
- [xiaoshengwpp/mcp-server-vision](https://github.com/xiaoshengwpp/mcp-server-vision): provider
  abstraction, allowed paths, richer image/video features, strict typing, and a documented security
  posture.
- [look4yo/claudecode-vision-mcp](https://github.com/look4yo/claudecode-vision-mcp): a clear
  before/after demonstration of a text-only model using a vision tool.

Sight MCP will adopt the bridge, preprocessing, local-provider, retry, and explicit path-policy
ideas. It will not adopt implicit proxying, arbitrary URL input, unbounded feature growth,
cwd-loaded plaintext credentials, or a global single-request queue as defaults.

## Chosen solution

Build a TypeScript, ESM, stdio-first MCP server using the official MCP TypeScript SDK v2 and Zod v4.

The first release exposes exactly one public tool, `analyze_image`, and exactly one provider type,
`openai-compatible`. The provider implementation is behind a neutral interface so later providers do
not change the tool contract.

The supported input is a local absolute path beneath an authorized root. URL input, raw base64
input, multi-image comparison, OCR-specific tools, and video are deliberately excluded until their
user value and security boundaries are validated.

## Alternatives considered

### Python core

Python has excellent Pillow, OpenCV, OCR, and local-model ecosystems. It was not selected because
v0.1.0 is a protocol and HTTP bridge rather than a model-runtime project. Requiring Python
environments would also make installation in coding hosts less predictable. A future optional Python
sidecar remains possible for capabilities that materially need it.

### Plain JavaScript

Plain JavaScript would reduce initial compiler setup. It was rejected because tool schemas,
configuration, provider results, and stable error unions are public boundaries that benefit from
compile-time checking.

### Go or Rust

Both can produce compact binaries and strong runtime guarantees. They were rejected for the first
release because the official TypeScript SDK provides the shortest path to current MCP features, host
examples, and npm distribution. They remain valid alternatives if startup, footprint, or
single-binary distribution becomes a measured constraint.

### Multiple tools in v0.1.0

Separate `describe_image`, `extract_text`, and `compare_images` tools are easy to understand but
duplicate input, security, and provider behavior. A single prompt-driven tool is enough to validate
the bridge. Specialized tools should only be added when evaluations show that tool selection or
output quality improves.

### HTTP-first server

Streamable HTTP is useful for shared remote deployments. It adds authentication, authorization,
origin/host validation, service operation, and network exposure that are unnecessary for a local
coding-host MVP. The application core remains transport-independent so HTTP can be proposed later.

## v0.1.0 scope

### Included

- TypeScript strict-mode ESM project on supported Node.js LTS releases.
- Official `@modelcontextprotocol/server` v2 package and stdio transport.
- One `analyze_image` tool with versioned structured results and a text fallback.
- Local absolute paths authorized against canonical allowed roots.
- PNG, JPEG, and WebP decoding through `sharp`.
- Orientation normalization, metadata removal, bounded resizing, and opaque/alpha-aware encoding.
- One OpenAI-compatible `/chat/completions` vision provider.
- Environment-based configuration with validation and secret redaction.
- Cancellation, deadlines, bounded concurrency, bounded queueing, and transient retry policy.
- Unit, provider-contract, MCP integration, packaging, and real-host smoke-test plans.
- npm package and `npx` execution path.

### Excluded

- Built-in model inference or model downloads.
- URL, data URL, raw base64, stdin image bytes, directories, globbing, and archives.
- GIF, SVG, PDF, HEIC, TIFF, RAW formats, video, audio, or multi-image calls.
- Provider selection per tool invocation, failover, load balancing, or fallback to a different
  endpoint.
- Anthropic-native, Gemini-native, or other vendor-specific adapters.
- SSE, legacy SSE, or Streamable HTTP server transports.
- GUI automation, screenshots captured by the server, OCR engines, image generation, or image
  editing.
- Persistent cache, conversation memory, telemetry, analytics, or a background daemon.
- Corporate proxy configuration beyond runtime-standard networking behavior.

### Distribution-name constraint

The unscoped npm name `sight-mcp` is already occupied (observed as version `1.0.4` on 2026-08-28).
The scaffold Issue must select and verify a publishable scoped package name before treating package
metadata as public. Documentation uses a package-name placeholder until that decision is recorded;
the GitHub project and product name remain Sight MCP.

## Architecture

```text
Claude Code / Codex
        |
        | MCP over stdio
        v
Transport entrypoint
        |
        v
analyze_image tool adapter
        |
        v
AnalyzeImage service
   |           |             |
   v           v             v
InputGuard  ImagePipeline  VisionProvider
   |           |             |
   v           v             v
filesystem    sharp       HTTPS / loopback HTTP
```

Dependency direction is inward. MCP types stop at the tool adapter; vendor response types stop at
the provider adapter; filesystem and `sharp` details stop at their adapters. The application service
coordinates typed domain inputs and results.

The request lifecycle is:

1. Zod validates the MCP arguments.
2. `InputGuard` requires an absolute path, resolves its canonical target, confirms it is within an
   allowed root, opens a regular file, and enforces a streaming byte limit.
3. `ImagePipeline` performs a bounded decode, rejects unsupported formats and pixel/dimension
   limits, normalizes orientation, strips metadata, resizes without enlargement, and emits JPEG for
   opaque images or PNG for images requiring alpha. Both dimensions and transmitted bytes are
   bounded.
4. `VisionProvider` sends the prompt and a data URL to the configured endpoint with an
   `AbortSignal`, no redirects, a bounded response body, and sanitized error mapping.
5. The tool returns a versioned object. Its readable text explicitly labels image/provider content
   as untrusted. It never returns the local path, source bytes, base64 data, credentials, headers,
   or raw upstream body.
6. All diagnostics go to stderr. stdout remains exclusively the MCP protocol stream.

## Public contract

The normative tool, output, errors, provider interface, cancellation, and compatibility rules are in
[the vision tool contract](../specs/vision-tool-contract.md).

The normative environment variables, defaults, URL policy, and validation rules are in
[the configuration specification](../specs/configuration.md).

## Security and privacy

The image itself, unrelated local files, provider credentials, and returned analysis are protected
assets. Sending an image to a remote provider is an intentional disclosure and must be visible in
documentation and configuration.

The implementation must satisfy the controls in [the threat model](../security/threat-model.md),
including canonical path authorization, symlink handling, bounded decoding, content-based format
detection, redirect denial, secret redaction, prompt-injection treatment, dependency review, and
protocol-stream integrity.

The v0.1.0 runtime is a local, single-user developer tool. It is not a multi-tenant sandbox and does
not defend against an attacker who already has the same operating-system account and can
continuously mutate authorized files. Residual local TOCTOU limitations must be documented and
minimized by opening and reading the resolved file through one bounded file-handle lifecycle.

## Quality and delivery

[The test and delivery strategy](../testing/strategy.md) defines:

- unit tests for every external boundary and security decision;
- deterministic provider contract tests without paid endpoints;
- a spawned stdio MCP integration suite;
- packaging verification from the packed tarball;
- manual release smoke tests in current Claude Code and Codex versions;
- CI permission, third-party Action pinning, dependency review, and artifact evidence expectations.

No numerical coverage threshold is set before a baseline exists. Missing branch coverage in
security-critical modules blocks release regardless of an aggregate percentage.

## Compatibility and versioning

Tool names, input schemas, output schemas, stable error codes, CLI flags, and environment keys are
public interfaces. v0.x may change them only with release notes and migration guidance. After 1.0,
incompatible changes require a major release.

The structured result includes `schemaVersion: "1"`. Older MCP clients still receive a text content
block. The v0.1.0 structured result remains an object even though the current MCP specification
permits other JSON values, preserving compatibility with older hosts.

## Observability and operation

The server is ephemeral and local. It emits structured, redacted diagnostics to stderr with request
ID, stage, duration, outcome, stable error code, retry count, and queue duration. It does not log
full file paths, prompts, image data, credentials, authorization headers, or provider response
bodies.

No telemetry leaves the machine. A future telemetry proposal must be opt-in and independently
reviewed.

## Delivery slices

Implementation should proceed as small, dependency-ordered Issues:

1. [#2: TypeScript/MCP project scaffold and CI foundation](https://github.com/Weiki886/sight-mcp/issues/2).
2. [#3: Secure local image authorization and preprocessing](https://github.com/Weiki886/sight-mcp/issues/3).
3. [#4: OpenAI-compatible provider adapter and resilience policy](https://github.com/Weiki886/sight-mcp/issues/4).
4. [#5: `analyze_image` application service and MCP tool integration](https://github.com/Weiki886/sight-mcp/issues/5).
5. [#6: Claude Code/Codex compatibility, packaging, documentation, and v0.1.0 release readiness](https://github.com/Weiki886/sight-mcp/issues/6).

## Acceptance criteria

- [ ] A reviewer can trace every in-scope behavior to a normative contract or configuration rule.
- [ ] The tool contract has a closed input schema, versioned success/error outputs, stable error
      categories, cancellation, and timeout semantics.
- [ ] The provider is replaceable without importing MCP types or changing the public tool schema.
- [ ] The threat model covers filesystem, decoder, network, provider, prompt-injection, logging,
      cost, dependency, and stdout integrity risks.
- [ ] The test matrix covers unit, contract, integration, packaging, and both target hosts.
- [ ] Each delivery slice has a linked, independently verifiable Issue in the v0.1.0 milestone.
- [ ] The proposal receives an explicit human acceptance record before runtime implementation
      starts.

## Risks and validation plan

| Assumption or risk                                 | Validation                                                                                                   | Exit or change condition                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| One prompt-driven tool is selected reliably        | Run the same image-question fixture in Claude Code and Codex                                                 | Add specialized tools only if repeated selection or prompting failures are observed                          |
| OpenAI-compatible APIs cover the first user set    | Contract-test representative response shapes; manually test one local and one remote endpoint before release | Propose a new adapter when compatibility shims would leak vendor behavior into the tool contract             |
| `sharp` provides safe-enough bounded preprocessing | Test bytes, pixels, dimensions, malformed inputs, alpha, orientation, and cancellation behavior              | Replace or isolate decoding if limits cannot be enforced before costly allocation                            |
| Environment-only configuration is usable           | Validate project and user-level host examples on macOS, Linux, and Windows syntax                            | Add a config file only if environment blocks prove unmanageable                                              |
| A clear npm distribution identity is available     | Verify ownership and publishability of a scoped package name before scaffold metadata is accepted            | Record a naming decision or choose an alternate scope; do not publish over the unrelated `sight-mcp` package |
| Text plus structured output works across hosts     | Spawn an SDK client and run current host smoke tests                                                         | Preserve the text fallback; revise structured fields only through versioned schema evolution                 |

## Decision and safety impact

- ADR: required; see [ADR 0001](../adr/0001-runtime-and-architecture.md).
- Threat model: required; see [the v0.1.0 threat model](../security/threat-model.md).
- Runtime risk after acceptance: high, because the implementation reads local files, handles
  secrets, invokes an external service, and publishes an MCP tool contract.
- Proposal change risk: low; this document changes no runtime behavior and can be reverted or
  superseded.

## References

- [MCP TypeScript SDK v2 package guidance](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/packages.md)
- [MCP 2026-07-28 tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP 2026-07-28 transports specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)
- [Codex MCP documentation](https://developers.openai.com/codex/mcp)
