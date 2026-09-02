import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  imageFailure,
  imageSuccess,
  type AuthorizedImage,
  type ClipboardImageReader,
  type ImageResult,
} from "../../domain/image.js";
import {
  osascriptCommand,
  runOsascriptCommand,
  type OsascriptCommandRunner,
  type OsascriptCommandResult,
} from "../macos/osascript.js";

export { osascriptCommand };
export type { OsascriptCommandResult, OsascriptCommandRunner };

const defaultMaxImageBytes = 20_971_520;

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

// `«class PNGf»` is AppleScript's stable clipboard image token. It is expressed
// with Unicode escapes here so the TypeScript source remains plain ASCII while
// the generated AppleScript still receives the exact four-char-code token.
const clipboardImageClass = "\u00abclass PNGf\u00bb";

const clipboardScript = [
  "on run argv",
  "  try",
  '    display dialog "Sight MCP wants to read the image on your clipboard and send it to the configured (possibly remote) vision provider. Allow?" with title "Sight MCP clipboard access" buttons {"Cancel", "Allow"} default button "Allow" cancel button "Cancel"',
  "  on error",
  '    return "DENIED"',
  "  end try",
  "  try",
  `    set imageData to (the clipboard as ${clipboardImageClass})`,
  "  on error",
  '    return "NO_IMAGE"',
  "  end try",
  "  try",
  "    set outputPath to first item of argv",
  "    set outFileRef to (open for access (POSIX file outputPath) with write permission)",
  "    set eof of outFileRef to 0",
  `    write imageData to outFileRef as ${clipboardImageClass}`,
  "    close access outFileRef",
  "  on error",
  "    try",
  "      close access outFileRef",
  "    end try",
  '    return "READ_FAILED"',
  "  end try",
  '  return "OK"',
  "end run",
].join("\n");

export interface MacOSClipboardImageReaderOptions {
  readonly inboxDirectory?: string;
  readonly maxImageBytes?: number;
  readonly platform?: NodeJS.Platform;
  readonly randomPath?: () => string;
  readonly run?: OsascriptCommandRunner;
}

export function createMacOSClipboardImageReader(
  options: MacOSClipboardImageReaderOptions = {},
): ClipboardImageReader {
  const platform = options.platform ?? process.platform;
  const maximumBytes = options.maxImageBytes ?? defaultMaxImageBytes;
  const run = options.run ?? runOsascriptCommand;
  const nextPath = options.randomPath ?? ((): string => randomUUID());
  const inboxDirectory =
    options.inboxDirectory ?? join(homedir(), "Library", "Caches", "Sight MCP", "inbox");

  return Object.freeze({
    async read(signal: AbortSignal): Promise<ImageResult<AuthorizedImage>> {
      if (platform !== "darwin") {
        return imageFailure("CLIPBOARD_UNAVAILABLE");
      }
      if (isAborted(signal)) {
        return imageFailure("CANCELLED");
      }

      const temporaryPath = join(inboxDirectory, `${nextPath()}.png`);
      try {
        await mkdir(inboxDirectory, { recursive: true, mode: 0o700 });
      } catch {
        return imageFailure("CLIPBOARD_READ_FAILED");
      }

      try {
        const result = await run(["-e", clipboardScript, temporaryPath], signal);
        if (result.aborted) {
          return imageFailure("CANCELLED");
        }
        if (result.exitCode === null || result.exitCode !== 0) {
          return imageFailure("CLIPBOARD_READ_FAILED");
        }

        const status = Buffer.from(result.stdout).toString("utf8").trim();
        if (status === "DENIED") {
          return imageFailure("CLIPBOARD_ACCESS_DENIED");
        }
        if (status === "NO_IMAGE") {
          return imageFailure("CLIPBOARD_NO_IMAGE");
        }
        if (status !== "OK") {
          return imageFailure("CLIPBOARD_READ_FAILED");
        }

        const fileStatus = await stat(temporaryPath);
        if (!fileStatus.isFile() || fileStatus.size > maximumBytes) {
          return imageFailure("FILE_TOO_LARGE");
        }

        const bytes = await readFile(temporaryPath);
        if (isAborted(signal)) {
          return imageFailure("CANCELLED");
        }

        return imageSuccess(Object.freeze({ bytes, originalBytes: bytes.byteLength }));
      } catch {
        return imageFailure("CLIPBOARD_READ_FAILED");
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    },
  });
}
