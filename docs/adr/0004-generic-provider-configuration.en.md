# ADR 0004: Remove built-in Provider profiles in favor of generic Provider configuration

**语言 / Language：** [中文](0004-generic-provider-configuration.md) · English

- Status: Accepted
- Accepted: 2026-09-17
- Date: 2026-09-17
- Deciders: Weiki886
- Related: [Issue #63](https://github.com/Weiki886/sight-mcp/issues/63),
  [ADR 0002](0002-macos-keychain-provider-profiles.en.md),
  [configuration](../specs/configuration.en.md), [threat model](../security/threat-model.en.md)

## Context

ADR 0002 introduced two built-in Provider profiles (`qwen` and `deepseek`), atomically binding the
API root, model, default reasoning effort, and Keychain account to simplify onboarding. In September
2026, `deepseek-v4-flash-vision-exp` was decommissioned upstream, breaking the `deepseek` profile
outright.

This exposed a structural problem with hardcoded models: model lifecycles are controlled by the
vendor, and every launch, deprecation, or rename costs a code change plus a release, while users
have no self-service remedy in the meantime. A bundled model list also drifts out of date — the
documented promise of a "reviewed fixed pairing" cannot keep up with vendor changes.

## Decision

Starting with v0.3.0, Sight MCP bundles no Provider address or model. This ADR supersedes the
built-in profiles design of ADR 0002 (its Keychain storage and interactive credential command design
is retained):

1. The endpoint and model come entirely from environment variables: `SIGHT_PROVIDER_BASE_URL` and
   `SIGHT_PROVIDER_MODEL` are both required, with no defaults or bundled pairings.
2. The `--provider` flag and the profile-specific environment variables (`SIGHT_QWEN_API_KEY` /
   `SIGHT_DEEPSEEK_API_KEY`) are removed. Passing `--provider` exits with status `2` and prints
   migration guidance.
3. API key resolution order is fixed: `SIGHT_PROVIDER_API_KEY`, then the macOS Keychain item named
   by `SIGHT_PROVIDER_KEYCHAIN_ACCOUNT` (new). With neither set, the endpoint is treated as
   unauthenticated; if a Keychain account is explicitly named but the item is missing or the lookup
   fails, startup fails closed without fallback.
4. Credential commands generalize to arbitrary account names:
   `credentials set|status|delete <account> [--yes]`. The account name is user-chosen (1-64
   characters from a restricted, validated character set). Keychain cannot enumerate items, so
   `status` requires an explicit account name. The Keychain service name
   (`dev.weiki886.sight-mcp.provider-api-key`) is unchanged, so existing items remain usable.
5. The qwen configuration appears in documentation only as an example and carries no compatibility
   guarantee.

### Breaking change and migration

This is a breaking change, handled per the compatibility policy in the configuration specification
(release notes plus a migration path during 0.x): former qwen profile users migrate equivalently by
setting `SIGHT_PROVIDER_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1` and
`SIGHT_PROVIDER_MODEL=qwen3.8-flash` explicitly; an existing `qwen` Keychain item can be reused via
`SIGHT_PROVIDER_KEYCHAIN_ACCOUNT=qwen`.

## Alternatives considered

- **Remove only deepseek and keep the qwen profile**: the smallest change, but the hardcoded-model
  maintenance problem remains and the same incident recurs with the next upstream change.
- **Turn profiles into an extensible built-in catalog**: a larger catalog worsens the review and
  drift problems, and adds no capability over the existing generic OpenAI-compatible mode.
- **Support a configuration file (TOML/YAML)**: introduces a new credential-discovery and audit
  boundary, conflicting with the configuration specification's standing decision against implicit
  config files; it would need its own proposal.

## Consequences

- Upstream model changes no longer require code changes or releases; users take over the review
  responsibility for endpoint/model selection, a boundary the README and configuration specification
  now state explicitly.
- Generality improves: any OpenAI-compatible vision endpoint (local or remote) is reachable with
  environment variables alone.
- Existing generic-mode users (who never used a profile) are unaffected; profile users need one
  documented, explicit migration.
- The CRED-series controls in the threat model are unchanged: fixed key resolution order, Keychain
  read only for an explicitly named account, fail closed, no automatic fallback.
