# Security Policy

**语言 / Language：** [中文](SECURITY.md) · English

## Reporting a Vulnerability

Please report security issues through GitHub private vulnerability reporting:
[Report a vulnerability](https://github.com/Weiki886/sight-mcp/security/advisories/new)

Do not disclose unfixed security issues in public Issues, Pull Requests, or discussions.

Please include where possible:

- Affected version and environment (MCP host, operating system, Node.js version);
- Reproduction steps or a proof of concept;
- Potential impact and attack surface assessment.

## Security-Sensitive Areas

This project reads local images and sends them to the user's configured vision Provider. The
following areas are security-sensitive:

- Path authorization boundaries: `SIGHT_ALLOWED_ROOTS`, client workspace roots, the in-session
  authorization cache, and symlink-escape protection;
- Credential protection: macOS Keychain, environment variables, and API-key redaction in logs and
  error output;
- Authorized clipboard image reading and temporary-file cleanup;
- Privacy data in Provider requests and responses (image pixels and prompts);
- Supply chain: the native `sharp` dependency, GitHub Actions, and the npm release pipeline.

## Supported Versions

Only the latest published release receives security fixes. npm versions are immutable: security
fixes ship as new patch or minor versions and never overwrite a published one.

## Response

This project is maintained by an individual and provides no SLA. The maintainer will try to
acknowledge reports within 7 days and, after assessing severity, share a fix or mitigation plan.

## Related Documents

- [Threat model](docs/security/threat-model.en.md)
- [Release process](docs/release/process.en.md)
