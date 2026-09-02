# ADR 0002: macOS Keychain credentials and fixed Provider profiles

**语言 / Language：** [中文](0002-macos-keychain-provider-profiles.md) · English

- Status: Accepted
- Accepted: 2026-09-01
- Date: 2026-09-01
- Deciders: Weiki886
- Related: [Issue #16](https://github.com/Weiki886/sight-mcp/issues/16),
  [ADR 0001](0001-runtime-and-architecture.en.md), [threat model](../security/threat-model.en.md)

## Context

ADR 0001 deliberately made the process environment the only source of Provider credentials. That
boundary is portable and auditable, but it makes a local Claude Code or Codex installation awkward:
the user must arrange for the key to be exported before every host launch or place it in a plaintext
host configuration or `.env` file. A repository `.env` is especially easy to copy, back up, log, or
commit accidentally.

Sight MCP has two documented remote vision targets. Their keys are not interchangeable, and a key
must not be silently paired with the other Provider's endpoint or model. The solution therefore
needs both credential storage and an explicit startup-time Provider selection.

## Decision

### Fixed profiles

Add `--provider qwen|deepseek`. A selected profile fixes the Provider base URL, model, and default
reasoning effort as one reviewed unit:

| Profile    | API root                                            | Model                          | Effort |
| ---------- | --------------------------------------------------- | ------------------------------ | ------ |
| `qwen`     | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash`                | `low`  |
| `deepseek` | `https://api.deepseek.com`                          | `deepseek-v4-flash-vision-exp` | `low`  |

The Tool cannot select or change a profile. Switching profiles requires changing the server
arguments and restarting the MCP host. There is no automatic fallback.

When a profile is selected, credential precedence is:

1. `SIGHT_PROVIDER_API_KEY`, for an explicit one-process override;
2. `SIGHT_QWEN_API_KEY` or `SIGHT_DEEPSEEK_API_KEY` for the selected profile;
3. the selected profile's macOS Keychain item.

Only the selected Provider's profile-specific variable or Keychain account is read. The existing
no-argument environment configuration remains backward compatible. `SIGHT_PROVIDER_REASONING_EFFORT`
may explicitly override a profile's default effort; the fixed endpoint and model cannot be
overridden while the profile is active.

### Credential storage

On macOS, store each key as a generic-password item with:

- service `dev.weiki886.sight-mcp.provider-api-key`;
- account `qwen` or `deepseek`.

Expose these management commands:

```text
sight-mcp credentials set qwen|deepseek
sight-mcp credentials status [qwen|deepseek]
sight-mcp credentials delete qwen|deepseek [--yes]
```

Use the built-in absolute executable `/usr/bin/security`; do not invoke a shell or add a native
credential dependency. `credentials set` requires an interactive terminal and runs
`add-generic-password` with the prompt-only `-w` option last. The key is entered directly into the
system command: it never becomes a Sight MCP command-line argument, shell-history entry, or Node.js
string during setup.

Runtime lookup uses an exact service/account query. The child process receives no shell, has a
15-second deadline, captures only bounded stdout for the requested secret, discards system stderr,
and maps failures to sanitized application errors. Status checks never request secret output.
Deletion targets exactly one service/account and requires confirmation unless `--yes` is explicit.

The Keychain is an opt-in source activated by `--provider`; Sight MCP still does not search the
repository or current directory for secrets. On non-macOS systems the existing environment mode and
profile-specific environment variables remain available. A missing, locked, or unavailable Keychain
fails closed and never triggers a different credential or Provider fallback.

## Consequences

### Positive

- Routine host startup no longer needs a plaintext API key or a pre-launch export step on macOS.
- Provider, endpoint, model, and credential account are selected as one explicit profile.
- Setup avoids putting the key in shell history, process arguments, logs, or repository files.
- The implementation uses an operating-system facility without adding a native addon or production
  package dependency.
- Generic OpenAI-compatible endpoints and non-macOS installations keep the established environment
  interface.

### Negative

- Native secure storage is macOS-specific in v0.1.0; other platforms still need environment
  injection or a local unauthenticated endpoint.
- The system may display a Keychain access prompt at setup or runtime according to local policy.
- Built-in profiles are intentionally less flexible than generic mode and must be updated when a
  Provider changes its public endpoint or model identifier.
- A same-user compromised process may still be able to request an accessible Keychain item.

## Rejected alternatives

- Repository or automatically loaded `.env`: plaintext at rest and easy to copy, back up, log, or
  commit; current-directory discovery is also surprising.
- Putting the key directly in `.mcp.json` or `config.toml`: exposes it to host configuration,
  diagnostics, backups, and accidental sharing.
- A launcher shell script: reduces typing but leaves credential injection and shell-history risks to
  user-maintained code.
- An encrypted project file: the application would also need to store or obtain its decryption key,
  recreating the original secret-management problem.
- `keytar` or another native addon: adds packaging and supply-chain cost before a second operating
  system backend is justified.
- Automatic Provider fallback: could disclose an image to an unselected operator and amplify cost.

## Compliance

Implementation conforms to this ADR when:

- profile parsing is closed to `qwen` and `deepseek`, and invalid input fails before MCP startup;
- fixed endpoint/model mappings and credential precedence have direct tests;
- Keychain subprocess arguments use exact service/account values, `shell: false`, bounded output,
  bounded duration, and sanitized failures;
- interactive setup contains no secret argument and status does not read secret output;
- deletion requires confirmation or `--yes` and cannot use a wildcard target;
- the no-argument environment configuration and protocol-only stdout behavior remain compatible;
- documentation includes migration, non-macOS fallback, and deletion instructions.
