# Configuration specification

**语言 / Language：** [中文](configuration.md) · English

- Status: Accepted
- Accepted: 2026-08-28
- Amended: 2026-08-31 by Issue #14 (optional Provider reasoning effort)
- Amended: 2026-09-01 by Issue #16 (Provider profiles and macOS Keychain credentials)
- Amended: 2026-09-17 by Issue #63 (built-in profiles removed in favor of generic Provider
  configuration)
- Version: v0.3.0
- Related: [Proposal 0001](../proposals/0001-sight-mcp-v0.1.0.en.md),
  [ADR 0002](../adr/0002-macos-keychain-provider-profiles.en.md),
  [ADR 0004](../adr/0004-generic-provider-configuration.en.md)

## Sources and precedence

Generic no-argument mode has two sources, in descending precedence:

1. process environment variables explicitly passed by the MCP host or shell;
2. compiled safe defaults documented below.

Sight MCP does not load `.env`, YAML, JSON, TOML, shell profiles, or repository credential files
implicitly. It does not search the current directory for configuration. This avoids surprising
credential discovery and makes the host configuration the auditable runtime boundary.

The endpoint and model come entirely from `SIGHT_PROVIDER_BASE_URL` and `SIGHT_PROVIDER_MODEL`; the
code contains no built-in Provider address or model. API key resolution precedence is:

1. `SIGHT_PROVIDER_API_KEY`;
2. the macOS Keychain item named by `SIGHT_PROVIDER_KEYCHAIN_ACCOUNT`.

With neither set, the endpoint is treated as unauthenticated (no authorization header), which suits
local servers. If `SIGHT_PROVIDER_KEYCHAIN_ACCOUNT` is set but the item is missing or the lookup
fails, startup fails without trying another credential source. Other variables, including allowed
roots and resource limits, continue to come from the process environment and compiled defaults.

Adding a general config file or another runtime CLI override requires a proposal that defines
precedence and secret handling.

## CLI and credential commands

```text
sight-mcp
sight-mcp credentials set <account>
sight-mcp credentials status <account>
sight-mcp credentials delete <account> [--yes]
```

No argument starts environment-variable mode. An unknown argument exits with status `2` before the
stdio transport starts; the removed `--provider` flag exits with status `2` and prints migration
guidance. `<account>` is a user-chosen Keychain account name (1-64 characters, starting with a
letter, then digits, `.`, `_`, `@`, or `-`) and must match `SIGHT_PROVIDER_KEYCHAIN_ACCOUNT`.
Keychain cannot enumerate items, so `status` requires an explicit account name. Credential
management commands are normal human-facing CLI commands and may write status to stdout; server mode
continues to reserve stdout exclusively for MCP frames.

Editing environment variables and restarting the MCP host is the only Provider switch; there is no
automatic fallback.

## Variables

The image-pipeline and logging variables are implemented by Issue #3. Provider URL/model/key,
Provider response, retry, and timeout variables are implemented by Issue #4. Concurrency and queue
variables are implemented by Issue #5 at the application-service boundary.

| Variable                            | Required/default | Validation and purpose                                                                                                        |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `SIGHT_PROVIDER_BASE_URL`           | required         | Absolute provider base URL ending at the API root, for example `https://provider.example/v1`; no userinfo, query, or fragment |
| `SIGHT_PROVIDER_MODEL`              | required         | Non-empty model identifier, maximum 256 characters                                                                            |
| `SIGHT_PROVIDER_API_KEY`            | optional         | Bearer credential; empty or unset sends no authorization header; takes precedence over Keychain                               |
| `SIGHT_PROVIDER_KEYCHAIN_ACCOUNT`   | optional         | macOS Keychain account read when no environment key is set, 1-64 characters                                                   |
| `SIGHT_PROVIDER_REASONING_EFFORT`   | optional         | `low`, `medium`, `high`, `xhigh`, or `max`; omitted unless explicitly configured                                              |
| `SIGHT_ALLOWED_ROOTS`               | process cwd      | Platform-delimited absolute roots using Node's `path.delimiter`; each root is canonicalized at startup                        |
| `SIGHT_REQUEST_TIMEOUT_MS`          | `60000`          | Integer from 1000 through 300000; overall tool-call deadline including queue and retries                                      |
| `SIGHT_MAX_IMAGE_BYTES`             | `20971520`       | Integer from 1 through 104857600; maximum source bytes read                                                                   |
| `SIGHT_MAX_IMAGE_PIXELS`            | `40000000`       | Integer from 1 through 100000000; decoded pixel limit                                                                         |
| `SIGHT_MAX_IMAGE_DIMENSION`         | `12000`          | Integer from 1 through 32768; maximum decoded width or height                                                                 |
| `SIGHT_TRANSMIT_MAX_DIMENSION`      | `2048`           | Integer from 64 through `SIGHT_MAX_IMAGE_DIMENSION`; resize bound without enlargement                                         |
| `SIGHT_MAX_TRANSMIT_BYTES`          | `10485760`       | Integer from 1024 through `SIGHT_MAX_IMAGE_BYTES`; maximum normalized image bytes sent to a provider                          |
| `SIGHT_JPEG_QUALITY`                | `85`             | Integer from 40 through 95; quality for opaque JPEG output                                                                    |
| `SIGHT_PROVIDER_MAX_TOKENS`         | `4096`           | Integer from 1 through 32768; requested provider answer-token cap                                                             |
| `SIGHT_MAX_PROVIDER_RESPONSE_BYTES` | `1048576`        | Integer from 1024 through 10485760; maximum upstream response body read                                                       |
| `SIGHT_MAX_OUTPUT_CHARS`            | `32000`          | Integer from 256 through 200000; maximum returned answer characters                                                           |
| `SIGHT_MAX_CONCURRENCY`             | `2`              | Integer from 1 through 16; simultaneously active analyses                                                                     |
| `SIGHT_MAX_QUEUE_SIZE`              | `8`              | Integer from 0 through 128; waiting calls; zero disables queueing                                                             |
| `SIGHT_MAX_RETRIES`                 | `2`              | Integer from 0 through 5; retries after the initial provider attempt                                                          |
| `SIGHT_LOG_LEVEL`                   | `info`           | One of `silent`, `error`, `warn`, `info`, `debug`; output is always stderr and redacted                                       |

The implementation must publish active defaults from one typed configuration module and reuse them
in help text and documentation tests to prevent drift.

`SIGHT_PROVIDER_REASONING_EFFORT` is an optional extension field for compatible Providers. When it
is unset, the adapter does not send `reasoning_effort`, preserving the minimum Chat Completions
request. Operators must choose a value supported by their configured model; Sight MCP validates the
portable enum but does not infer a vendor or silently rewrite one Provider's model-specific mapping.

If normalization cannot satisfy both transmit dimensions and transmit bytes without dropping
required alpha information or violating the minimum JPEG quality, the call fails with
`IMAGE_TOO_LARGE`. Sight MCP does not silently send an oversized payload.

## Provider URL policy

- `https` is required for non-loopback hosts.
- Plain `http` is accepted only when the URL host is exactly `localhost`, an IPv4 loopback address
  in `127.0.0.0/8`, or IPv6 loopback `::1`.
- Embedded username/password, query strings, fragments, non-HTTP schemes, and invalid ports are
  rejected.
- The adapter constructs exactly one `/chat/completions` path from the normalized API root.
  Configuration that already contains that operation path is rejected to avoid ambiguous path
  joining.
- HTTP redirects are disabled. A redirect is an upstream failure, not a new destination to follow.
- The configured destination is trusted operator input, not tool-call input. The endpoint and model
  cannot be changed per request.

These rules allow local Ollama, LM Studio, vLLM, or similar gateways without TLS while preventing
accidental cleartext transfer to a remote host.

## Allowed-root policy

- Empty or unset `SIGHT_ALLOWED_ROOTS` means the server startup cwd only.
- Every configured root must be absolute, exist, resolve canonically at startup, and be a directory.
- Duplicate and nested roots are normalized to the smallest equivalent set.
- The root itself is allowed; a target must be a descendant after platform-appropriate canonical
  comparison.
- On case-insensitive platforms, comparison follows the platform filesystem semantics rather than
  string casing supplied by the caller.
- Home-directory shorthand such as `~` is not expanded. Host configuration must pass an absolute
  path.
- Broad roots such as the filesystem root or an entire home directory are accepted only when
  explicitly configured; startup emits a redacted warning because the choice weakens least
  privilege.

Examples use placeholders rather than real user paths:

```json
{
  "SIGHT_ALLOWED_ROOTS": "/absolute/project/path:/absolute/image-fixtures"
}
```

On Windows, Node's platform delimiter is `;`:

```json
{
  "SIGHT_ALLOWED_ROOTS": "C:\\absolute\\project;D:\\image-fixtures"
}
```

### Client workspace root discovery

When the connected MCP client advertises the `roots` capability (Claude Code does), Sight MCP
requests the client's workspace roots once initialization completes and adopts them as allowed
roots, so reads inside the workspace need no authorization dialog.

- The request runs in the background with a 3-second timeout; every failure (capability absent,
  protocol era unsupported, timeout) degrades silently and never blocks a tool call.
- Only `file://` roots are accepted; other schemes are ignored.
- Each path is canonicalized with `realpath` and must resolve to an existing directory.
- The filesystem root `/` and the whole home directory are refused and reported as a warning rather
  than adopted.
- Nested roots collapse to the minimal equivalent set, matching `SIGHT_ALLOWED_ROOTS` behaviour.
- A client may send `notifications/roots/list_changed` to have the server refresh the set.

**Note:** `roots/list` is deprecated as of MCP revision 2026-07-28 (SEP-2577) and the SDK refuses to
send it on that era. This feature is an optional enhancement, not the only way to avoid dialogs, and
the server works normally when a client cannot serve it.

### Session authorization cache

When a path falls outside both the configured roots and the discovered client roots, Sight MCP shows
the macOS authorization dialog. Once the user allows it, the **parent directory** of that path is
recorded in an in-process cache, so other files in the same directory do not prompt again during the
session.

- The cache lives only in process memory and is cleared on restart — it is never written to disk.
- Grants are directory-scoped: approving `~/Downloads/a.png` grants `~/Downloads` and never widens
  to `~`.
- The filesystem root `/` and the whole home directory are never cached, regardless of path depth.
- A cancelled read (aborted signal) leaves no grant behind.
- A denial is not cached; the next read of that path prompts again.

This layer is protocol-independent and is the fallback that removes repeat dialogs when a client
does not support root discovery.

## Startup behavior

The server validates all configuration before connecting the MCP transport. Missing required values,
invalid numbers, invalid roots, and unsafe provider URLs cause a non-zero exit with a stable
redacted diagnostic on stderr.

Diagnostics identify the variable name and rule but never echo secret values. For example, an
invalid API key is reported as `SIGHT_PROVIDER_API_KEY is invalid` rather than including the value.

The server does not print a startup banner to stdout.

## Secret handling

- API keys exist only in process memory and request authorization headers.
- Configuration objects expose secrets through a narrow secret type that is redacted by logging and
  serialization helpers.
- Errors and debug logs must not serialize `process.env`, the complete configuration object, request
  headers, or provider request objects.
- Tests use obvious placeholders and verify redaction against representative error paths.
- On macOS, `credentials set` writes an exact generic-password item using `/usr/bin/security` and
  the system's interactive password prompt. The service is
  `dev.weiki886.sight-mcp.provider-api-key`; the account is a user-chosen name.
- Interactive setup passes no secret in a process argument or through a shell. It requires stdin and
  stderr terminals and fails rather than accepting piped key material.
- Runtime lookup captures at most the validated key bound, discards system diagnostics, and keeps
  the value only in process memory. `credentials status` checks item existence without reading the
  password.
- `credentials delete` names one exact account and prompts by default. `--yes` is required for
  explicit non-interactive deletion.
- A locked, unavailable, or failed Keychain query produces a sanitized startup failure and does not
  fall back to another Provider.
- Documentation recommends macOS Keychain, host-managed environment variables, or a local Provider.
  It must not recommend committing keys to `.mcp.json`, `config.toml`, shell scripts, or repository
  `.env` files.

Keychain storage is macOS-only. On Linux and Windows, use the `SIGHT_PROVIDER_API_KEY` environment
variable; Keychain is never queried unless `SIGHT_PROVIDER_KEYCHAIN_ACCOUNT` is set.

## Compatibility policy

Environment variable names, credential commands, the Keychain service name, and their precedence are
public interfaces. Adding an optional variable is backward compatible. Removing, renaming, changing
precedence, or weakening a safe default requires release notes and a migration path; after 1.0 it
requires a major version. v0.3.0 applies this policy: it removes the built-in profiles, the
`--provider` flag, and the profile-specific environment variables (`SIGHT_QWEN_API_KEY` /
`SIGHT_DEEPSEEK_API_KEY`), with a migration path documented in the README.
