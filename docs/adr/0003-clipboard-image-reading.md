# ADR 0003: One-click clipboard image reading

- Status: Accepted
- Accepted: 2026-09-01
- Date: 2026-09-01
- Deciders: Weiki886
- Related: [ADR 0001](0001-runtime-and-architecture.md),
  [tool contract](../specs/vision-tool-contract.md), [threat model](../security/threat-model.md)

## Context

ADR 0001 restricted image input to an absolute path inside operator-configured allowed roots. That
boundary is predictable and auditable, but it forces the user to save every image into an allowed
directory before a text-only host can ask about it. Screenshots and pasted images usually start on
the system clipboard, so the practical workflow is "copy/screenshot, then file-dialog/save, then
call the tool" — three manual steps even though the bytes are already in memory.

The requirement is not to give the host a general file reader, and it must not become a silent
clipboard exfiltration channel. A clipboard image is still sensitive visible content that a remote
Provider may receive, so reading it needs the same explicit, locally visible consent that the
allowed-root selection provides for files.

## Decision

Add a second, read-only tool `analyze_clipboard_image(prompt)`. It accepts only the analysis
`prompt`; the image source is the macOS system clipboard. The tool cannot take a path, URL, base64
string, MIME type, or any way to change the source.

### User consent and platform scope

The first implementation is macOS-only. Before reading, the server runs the absolute
`/usr/bin/osascript` (no shell) to show a native `display dialog` that describes where the image may
be sent and asks the user to allow or cancel. Canceling returns `CLIPBOARD_ACCESS_DENIED`. There is
no silent or cached consent; every call requires the dialog.

Other platforms return `CLIPBOARD_UNAVAILABLE` without invoking a helper. A future port must add its
own consent mechanism under a new ADR rather than silently reusing this design.

### Temporary storage

The clipboard is read as a PNG and written to a temporary file inside a user-private directory:

```text
~/Library/Caches/Sight MCP/inbox
```

The directory is created with mode `0700` and the file uses a random UUID name. The file is read
immediately, bounded in bytes, and deleted in a `finally` block whether the read succeeds, fails, or
is cancelled. The source clipboard stays untouched. No clipboard bytes are written to logs, errors,
or the MCP stdout channel.

### Shared analysis pipeline

Clipboard analysis reuses the existing bounded queue, `ImagePipeline`, and `VisionProvider`, and it
returns the same versioned `AnalyzeImageResult` and output schema as `analyze_image`. It therefore
inherits decode, dimension, pixel, output, timeout, queue, retry, and cost limits. The clipboard
path does not go through the filesystem `InputGuard`, because there is no stable filesystem path to
authorize; instead, the native consent dialog is the access boundary.

### Stable error codes

```text
CLIPBOARD_ACCESS_DENIED  the user denied or cancelled the confirmation
CLIPBOARD_NO_IMAGE       the clipboard does not contain an image
CLIPBOARD_READ_FAILED    the clipboard image could not be written or read
CLIPBOARD_UNAVAILABLE    clipboard reading is unsupported on this platform
```

Oversize clipboard images reuse `FILE_TOO_LARGE`; cancellation reuses `CANCELLED`.

## Consequences

### Positive

- The copy/screenshot → save → call loop collapses to copy → call.
- Consent is explicit per call and visible in the user's own interface.
- The clipboard source is read without a persistent project cache and without an unbounded or
  world-readable temporary file.
- Existing tool, output, provider, configuration, and credential behavior are unchanged.

### Negative

- macOS-only in v0.1.0, matching the existing Keychain backend; other platforms are not served.
- `osascript` runs under the local user and depends on macOS Automation permissions in some
  configurations, which may present additional system prompts.
- Although the temporary file is private and immediately deleted, clipboard input introduces an
  on-disk step that pure file input avoids; managed-memory copies still cannot be zeroized
  immediately.
- The host model may now trigger a clipboard read, which can surface more than the user expected if
  the clipboard holds a sensitive image; the single confirmation dialog is the mitigation, not a
  technical guarantee.

### Risks

- A same-user process could prompt or read the clipboard through the same mechanism; the threat
  model already assumes a same-user attacker is not fully containable.
- AppleScript/`osascript` behavior can change across macOS versions; the implementation uses a
  stable four-char-code token and treats all non-`OK` statuses as failures.

## Rejected alternatives

- Accepting a pasted path into `analyze_image`: keeps the filesystem allowlist but does not remove
  the manual save step, and clipboard managers/paste events are awkward in stdio MCP.
- Automatically copying any pasted/clipboard item into an allowed project folder: expands on-disk
  state, risks tracked-artifact leakage, and still needs a reliable source for the bytes.
- Reading the clipboard silently inside `analyze_image`: no explicit consent, and a text-only host
  could trigger image exfiltration without the user noticing.
- A persistent clipboard cache directory: accumulates sensitive images and defeats the "read once,
  delete immediately" boundary.
- Supporting Windows/Linux clipboard now: adds per-platform dependencies and permission models
  before the macOS consent loop is validated.

## Compliance

Implementation conforms to this ADR when:

- `analyze_clipboard_image` accepts only a `prompt` and shares the `analyze_image` output schema and
  error mapping;
- the subprocess uses `shell: false` and a bounded deadline, and never receives image bytes in
  arguments;
- a user-visible confirmation is required before every read and its rejection maps to
  `CLIPBOARD_ACCESS_DENIED`;
- temporary bytes stay in a `0700` user-private directory with a random name and are deleted in all
  exit paths;
- clipboard bytes, prompts, and temporary paths do not reach logs, errors, or stdout;
- cancellation and the image byte limit are bounded and tested;
- non-macOS returns `CLIPBOARD_UNAVAILABLE` without spawning a helper.
