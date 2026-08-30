# Test fixture provenance

Sight MCP does not currently commit binary image fixtures. Security tests generate small PNG, JPEG,
WebP, alpha, EXIF-orientation, malformed-header, extreme-dimension, and deterministic high-entropy
inputs in memory with Sharp or explicit byte construction.

All generated pixels and metadata are project-created and contain no personal or confidential data.
If a binary fixture is added later, record its source, license, checksum, and threat-model purpose
in this file before committing it.

`adversarial-provider-answer.txt` is project-created synthetic text for threat AI-02. It imitates a
malicious Provider answer that asks the Host to reinterpret configuration and perform follow-up side
effects. MCP contract and stdio integration tests prove Sight MCP preserves it only as explicitly
labelled untrusted output; the server never acts on it.
