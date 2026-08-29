# Sight MCP v0.1.0 threat model

- Status: Accepted
- Accepted: 2026-08-28
- Date: 2026-08-28
- Runtime risk: High
- Scope: local stdio server, local image input, `sharp` preprocessing, one OpenAI-compatible vision
  provider
- Related: [Proposal 0001](../proposals/0001-sight-mcp-v0.1.0.md),
  [tool contract](../specs/vision-tool-contract.md), [configuration](../specs/configuration.md)

## Security objectives

1. Read only the local image the user has made reachable through an allowed root.
2. Never send an image to a destination other than the explicitly configured provider.
3. Keep credentials, local paths, image bytes, prompts, and raw upstream responses out of logs and
   public errors.
4. Bound CPU, memory, file descriptors, queue growth, network duration, retries, response size, and
   provider cost amplification.
5. Preserve the MCP stdio protocol channel and return deterministic, sanitized errors.
6. Treat image content and provider output as untrusted data, not executable instructions.

## Assets

- Contents and metadata of the selected image.
- Contents and names of unrelated local files.
- Provider API key and endpoint configuration.
- The user's prompt and the provider's answer.
- Provider quota, billing, and availability.
- Host and server process availability.
- Integrity of the MCP protocol stream and public tool contract.
- Dependency and release provenance.

## Actors

- User: chooses host configuration, allowed roots, provider, image, and task.
- Host model: untrusted planner that selects the MCP tool and supplies arguments.
- Local MCP host: launches the server and transports calls/cancellation.
- Local filesystem: contains authorized and unauthorized data and may contain links or special
  files.
- Image decoder: native `sharp`/libvips dependency processing attacker-controlled bytes.
- Vision provider: separately operated local or remote service; its output is untrusted.
- Network attacker: relevant for remote provider traffic and dependency/package retrieval.
- Repository contributor or compromised dependency: potential supply-chain actor.

## Trust boundaries

```text
Untrusted prompt/model arguments
        |
        v
[MCP/Zod boundary]
        |
        v
Sight MCP process ---- [filesystem boundary] ---- local files
        |
        +---- [native decoder boundary] ---- sharp/libvips
        |
        +---- [network/TLS boundary] ---- configured provider
        |
        +---- [stderr boundary] ---- local diagnostics
```

stdout is a separate protocol-only boundary. No diagnostic data may cross it.

## Assumptions and non-goals

- The server runs as the same local operating-system user as the MCP host.
- The operator-controlled environment and provider base URL are trusted configuration inputs.
- The host model and all tool arguments remain untrusted.
- The provider may be buggy, compromised, prompt-injected, or return malicious text.
- v0.1.0 is not a multi-tenant security boundary.
- Sight MCP cannot protect data from an attacker who already controls the same account, process
  environment, MCP host, or provider.
- The server does not execute provider output, fetch URLs from it, or invoke follow-up tools.

## Threats and controls

| ID      | Threat                                                                  | Impact                                         | Required controls                                                                                                                                      | Verification                                                                                |
| ------- | ----------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| FS-01   | Relative paths or traversal escape intended scope                       | Unrelated file disclosure                      | Require platform-absolute input; canonicalize target and roots; compare by path segments, not string prefix                                            | Unit tests for relative paths, `..`, sibling-prefix collisions, separator and case behavior |
| FS-02   | Symlink/junction points outside an allowed root                         | Unrelated file disclosure                      | Resolve canonical target before authorization; open resolved target; verify file-handle stat is regular; use no-follow flags where portable            | Symlink/junction escape tests on supported platforms                                        |
| FS-03   | Target changes between authorization and read                           | Unrelated file read                            | Keep canonicalization, open, stat, and bounded read in one service; prefer no-follow open; document residual same-user TOCTOU limitation               | Race-focused review and best-effort test; residual risk recorded                            |
| FS-04   | Device, pipe, socket, directory, or special file                        | Blocking, data disclosure, resource exhaustion | Require regular-file status from opened handle; reject every other kind                                                                                | Fixture tests for directory and available special-file types                                |
| IMG-01  | Oversized source                                                        | Memory/disk pressure                           | Stat and streaming byte cap; abort if file grows beyond cap                                                                                            | Exact-boundary and growing-stream tests                                                     |
| IMG-02  | Decompression bomb, extreme dimensions, or oversized normalized payload | CPU/memory/network exhaustion                  | `sharp` decode pixel limit, explicit dimension and transmit-byte limits, bounded formats, concurrency and deadline                                     | Synthetic header fixtures and decoder/encode limit tests                                    |
| IMG-03  | Misleading extension or polyglot                                        | Parser confusion, bypass                       | Ignore extension for trust; allowlist PNG/JPEG/WebP signatures before native decode; require the decoded format to match                               | Mismatch, malformed, and polyglot fixtures                                                  |
| IMG-04  | Decoder vulnerability                                                   | Code execution or crash                        | Minimal format set; lockfile; dependency review; security updates; sandboxing documented as future defense-in-depth                                    | SCA, advisories, malformed corpus, release review                                           |
| IMG-05  | EXIF or ancillary metadata is disclosed                                 | Location/device/privacy leak                   | Normalize orientation, then strip metadata before transmission                                                                                         | Fixture with EXIF/GPS and output metadata inspection                                        |
| NET-01  | Arbitrary URL or redirect causes SSRF                                   | Internal service/data exposure                 | No URL tool input; validated configured endpoint only; HTTPS remote/HTTP loopback; redirects disabled                                                  | Schema test, URL-policy tests, redirect contract test                                       |
| NET-02  | Cleartext remote provider                                               | Image/key interception                         | HTTPS required except exact loopback destinations                                                                                                      | URL-policy unit tests                                                                       |
| NET-03  | Provider returns an unbounded body or stalls                            | Memory/availability                            | Overall deadline, abortable streaming read, response-byte cap, output-char cap                                                                         | Slow/chunked/oversized mock-server tests                                                    |
| NET-04  | Provider errors leak body, headers, or key                              | Secret/content disclosure                      | Stable sanitized errors; redacting logger; never serialize request/response bodies                                                                     | Snapshot tests with embedded canary secrets                                                 |
| PRIV-01 | Image is sent remotely without user awareness                           | Privacy breach                                 | Explicit provider configuration and documentation; no automatic fallback or endpoint switching; expose adapter/model in result                         | Documentation review and configuration tests                                                |
| PRIV-02 | Full local path or prompt appears in results/logs                       | Local/privacy disclosure                       | Result omits path/prompt; logs use request ID and stage only; broad redaction                                                                          | Result and log canary tests                                                                 |
| AI-01   | Image contains instructions targeting the host model                    | Prompt injection and unsafe follow-up actions  | Tool description, provider system message, and text-result prefix label image/provider text untrusted; server returns data only; never acts on content | Tool/request metadata assertions and adversarial fixture in host smoke test                 |
| AI-02   | Provider returns malicious instructions or fake metadata                | Prompt injection/integrity loss                | Validate response shape; metadata is generated locally/configured, not parsed from answer; never execute output                                        | Contract tests with malicious provider text                                                 |
| COST-01 | Concurrent or repeated calls amplify cost                               | Quota/billing denial                           | Bounded concurrency/queue/retries/deadline; tool not marked idempotent; expose retryability                                                            | Queue, retry, cancellation, and exhaustion tests                                            |
| COST-02 | 429/5xx retry storm                                                     | Cost/availability                              | Small retry cap, jitter, bounded `Retry-After`, remaining-deadline check                                                                               | Deterministic fake-clock contract tests                                                     |
| LOG-01  | stdout diagnostics corrupt MCP                                          | Tool failure or injected frames                | Protocol writes only on stdout; logger permanently bound to stderr                                                                                     | Spawned integration test rejects any non-protocol stdout                                    |
| CFG-01  | Missing/invalid config falls back unsafely                              | Wrong endpoint or excessive access             | Fail before transport connect; cwd-only root default; no implicit credential/config files                                                              | Startup matrix tests                                                                        |
| CFG-02  | Debug serialization exposes secrets                                     | Credential leak                                | Secret wrapper/redaction; prohibit dumping env/config/request objects                                                                                  | Canary-secret tests at every log level                                                      |
| SUP-01  | Malicious package or Action compromises build                           | Source/release compromise                      | Minimal dependencies; pnpm lockfile; review; third-party Actions pinned to full SHA; read-only default token; dependency and secret scanning           | PR/CI review and release evidence                                                           |
| SUP-02  | Published tarball differs from reviewed source                          | Consumer compromise                            | CI pack once; inspect contents; bind tarball digest to commit/release; SBOM/provenance as release gate                                                 | Clean-install and digest verification                                                       |

## Data flow and retention

1. The local file is read into bounded process memory.
2. A normalized image is produced in memory; v0.1.0 creates no temporary file.
3. The normalized bytes are encoded for one provider request.
4. Source and normalized buffers become unreachable after request completion/cancellation and are
   not cached.
5. The server writes no prompt, answer, image, or usage history to disk.
6. Provider-side retention is outside Sight MCP's control and must be assessed by the user when
   choosing a remote endpoint.

JavaScript cannot guarantee immediate zeroization of all copies. The design minimizes lifetime and
duplication but does not claim secure erasure from managed memory.

## Privacy disclosure requirements

User documentation must state:

- whether the configured endpoint is local or remote;
- that remote analysis transmits normalized image pixels and the prompt;
- that metadata is removed but visible content remains sensitive;
- that provider retention, training, jurisdiction, and access policy are provider responsibilities;
- that allowed roots grant read eligibility, not automatic upload of every file in the root;
- that each actual upload still occurs only when the host calls the tool.

## Security gates for implementation PRs

- FS/image work requires a high-risk label, threat-model review, and security regression tests.
- Provider work requires a high-risk label, credential/redaction tests, destination-policy tests,
  and no live secrets.
- Tool integration requires adversarial prompt-injection wording and stdout-integrity tests.
- Workflow/release changes require least-privilege review and full-SHA pins for third-party Actions.
- A known critical decoder or runtime vulnerability blocks release unless a separately approved,
  expiring exception documents non-exploitability and compensation.

## Residual risks

- Same-user filesystem races cannot be fully eliminated portably in Node.js; scope is reduced by
  canonicalization, opened-handle validation, bounded read, and a local single-user deployment
  assumption.
- Native image decoding remains a memory-safety and availability risk despite format and resource
  limits.
- Sharp/libvips work cannot be interrupted safely in the middle of one native operation. Abort
  signals are checked before and after metadata/decode/encode stages, so cancellation bounds later
  work but cannot reclaim an already-running native stage immediately.
- Provider output can still influence a host model. Sight MCP can label and structure data but
  cannot enforce the host's later behavior.
- Remote provider policy and retention cannot be technically enforced by Sight MCP.
- An operator can intentionally configure an overly broad allowed root or a remote provider;
  warnings cannot replace operator judgment.

## Review triggers

Update or supersede this threat model before adding URL/base64 input, archives, SVG/PDF/video,
server-side capture, caches, persistent logs, telemetry, multiple providers, automatic failover,
Streamable HTTP, authentication, remote hosting, or multi-tenant use.
