# Configuration specification

- Status: Accepted
- Accepted: 2026-08-28
- Version: v0.1.0
- Related: [Proposal 0001](../proposals/0001-sight-mcp-v0.1.0.md)

## Sources and precedence

v0.1.0 runtime configuration has two sources, in descending precedence:

1. process environment variables explicitly passed by the MCP host or shell;
2. compiled safe defaults documented below.

Sight MCP does not load `.env`, YAML, JSON, TOML, shell profiles, or credential files implicitly. It
does not search the current directory for configuration. This avoids surprising credential discovery
and makes the host configuration the auditable runtime boundary.

CLI commands such as `--help`, `--version`, and a future `doctor` command do not override server
runtime settings in v0.1.0. Adding a config file or runtime CLI override requires a proposal that
defines precedence and secret handling.

## Variables

The image-pipeline and logging variables are implemented by Issue #3. Provider, response,
concurrency, queue, retry, and timeout variables remain normative v0.1.0 requirements and become
active in their corresponding implementation Issues; until then they are not silently consumed.

| Variable                            | Required/default | Validation and purpose                                                                                                        |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `SIGHT_PROVIDER_BASE_URL`           | required         | Absolute provider base URL ending at the API root, for example `https://provider.example/v1`; no userinfo, query, or fragment |
| `SIGHT_PROVIDER_MODEL`              | required         | Non-empty model identifier, maximum 256 characters                                                                            |
| `SIGHT_PROVIDER_API_KEY`            | optional         | Bearer credential; empty/unset means no authorization header, suitable for local endpoints                                    |
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
- Documentation recommends host-managed environment variables or a local provider. It must not
  recommend committing keys to `.mcp.json`, `config.toml`, shell scripts, or repository `.env`
  files.

## Compatibility policy

Environment variable names and meanings are public interfaces. Adding an optional variable is
backward compatible. Removing, renaming, changing precedence, or weakening a safe default requires
release notes and a migration path; after 1.0 it requires a major version.
