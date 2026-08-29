# Sharp dependency review

- Package: `sharp`
- Reviewed version: 0.35.4
- Runtime role: decode and normalize allowlisted PNG, JPEG, and WebP image bytes in memory
- Direct license: Apache-2.0
- Native component: prebuilt libvips binaries and their transitive libraries, with platform-specific
  license obligations described by the upstream distribution
- Review date: 2026-08-30
- Related threat: `IMG-04` in the [threat model](../security/threat-model.md)

## Decision

Accept Sharp 0.35.4 as a direct production dependency. It provides explicit input pixel/channel
limits, fail-on-warning decoding, orientation normalization, bounded resize, metadata-stripping by
default when metadata is not retained, and deterministic JPEG/PNG re-encoding. Implementing and
maintaining equivalent native codecs in this repository would create a larger security and
portability burden.

Inputs are signature-allowlisted as PNG, JPEG, or WebP before Sharp. The decoded format must match
the signature. SVG, GIF, TIFF, PDF, HEIF, raw pixels, filesystem paths, URLs, and multi-page input
are not accepted through the image-pipeline boundary. Sharp receives bounded in-memory bytes with
`failOn: "warning"`, pixel/channel limits, `unlimited: false`, sequential reading, and one requested
page. The process-wide Sharp operation cache is disabled. Every accepted image is freshly encoded;
source metadata is not retained.

## Security and maintenance

The project lockfile fixes the installed dependency graph, while `package.json` admits compatible
patch/minor updates for reviewed CI. Production dependency audit is part of `pnpm run ci`. Sharp's
published security policy supports the latest release line. Advisory GHSA-f88m-g3jw-g9cj affected
versions before 0.35.0 and is fixed in the reviewed 0.35.4 line.

Native decoding remains an attack surface and can consume CPU until the current native operation
returns. Security updates to Sharp or bundled libvips must be treated as high-priority dependency
reviews. CI and release testing must cover Node 22+, supported target operating systems, malformed
inputs, package installation, and production audit output.

## Upgrade and rollback

For an upgrade, review release notes, license changes, advisories, supported platforms, native
binary provenance, and behavior of metadata, orientation, limits, and output encoding. Regenerate
the lockfile and run the complete quality gate.

Before release, roll back by reverting the dependency and pipeline change together. After an npm
release, do not replace an artifact: deprecate the affected version, publish a reviewed patch, and
retain advisory and artifact evidence.

## Upstream references

- [Constructor and input safety options](https://sharp.pixelplumbing.com/api-constructor/)
- [Resize behavior](https://sharp.pixelplumbing.com/api-resize/)
- [Security policy](https://github.com/lovell/sharp/security)
- [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj)
