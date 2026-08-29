import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

import type { ImageConfig } from "../../config.js";
import {
  imageFailure,
  imageSuccess,
  type AuthorizedImage,
  type ImageResult,
  type InputGuard,
} from "../../domain/image.js";

type InputGuardConfig = Pick<ImageConfig, "allowedRoots" | "maxImageBytes">;

type BoundedReadResult =
  | Readonly<{ bytes: Uint8Array; kind: "ok" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "too-large" }>;

interface ReadableFileHandle {
  readonly read: (
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ) => Promise<{ bytesRead: number }>;
}

const readChunkBytes = 64 * 1_024;

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

function fileAccessFailure<Value>(error: unknown): ImageResult<Value> {
  const code = errorCode(error);
  if (code === "EISDIR") {
    return imageFailure("FILE_NOT_REGULAR");
  }
  if (code === "ENOENT" || code === "ENOTDIR") {
    return imageFailure("FILE_NOT_FOUND");
  }
  if (code === "EACCES" || code === "ELOOP" || code === "EPERM") {
    return imageFailure("PATH_NOT_ALLOWED");
  }
  return imageFailure("INTERNAL_ERROR");
}

export async function readFileBounded(
  handle: ReadableFileHandle,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<BoundedReadResult> {
  const chunks: Uint8Array[] = [];
  let bytesReadTotal = 0;

  while (bytesReadTotal <= maximumBytes) {
    if (isAborted(signal)) {
      return Object.freeze({ kind: "cancelled" });
    }

    const bytesRemaining = maximumBytes + 1 - bytesReadTotal;
    const buffer = new Uint8Array(Math.min(readChunkBytes, bytesRemaining));
    const readResult = await handle.read(buffer, 0, buffer.byteLength, bytesReadTotal);

    if (readResult.bytesRead === 0) {
      const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
      return Object.freeze({ bytes, kind: "ok" });
    }

    chunks.push(buffer.subarray(0, readResult.bytesRead));
    bytesReadTotal += readResult.bytesRead;
  }

  return Object.freeze({ kind: "too-large" });
}

export function createNodeInputGuard(config: InputGuardConfig): InputGuard {
  return Object.freeze({
    async readAuthorizedImage(
      inputPath: string,
      signal: AbortSignal,
    ): Promise<ImageResult<AuthorizedImage>> {
      if (isAborted(signal)) {
        return imageFailure("CANCELLED");
      }
      if (!isAbsolute(inputPath)) {
        return imageFailure("PATH_NOT_ABSOLUTE");
      }

      let canonicalPath: string;
      try {
        canonicalPath = await realpath(inputPath);
      } catch (error: unknown) {
        return fileAccessFailure(error);
      }

      if (!config.allowedRoots.some((root) => isWithinRoot(root, canonicalPath))) {
        return imageFailure("PATH_NOT_ALLOWED");
      }
      if (isAborted(signal)) {
        return imageFailure("CANCELLED");
      }

      let handle;
      try {
        handle = await open(
          canonicalPath,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
      } catch (error: unknown) {
        return fileAccessFailure(error);
      }

      try {
        const currentCanonicalPath = await realpath(canonicalPath);
        if (!config.allowedRoots.some((root) => isWithinRoot(root, currentCanonicalPath))) {
          return imageFailure("PATH_NOT_ALLOWED");
        }
        const [openedStatus, pathStatus] = await Promise.all([
          handle.stat({ bigint: true }),
          stat(currentCanonicalPath, { bigint: true }),
        ]);

        if (!openedStatus.isFile()) {
          return imageFailure("FILE_NOT_REGULAR");
        }
        if (openedStatus.dev !== pathStatus.dev || openedStatus.ino !== pathStatus.ino) {
          return imageFailure("PATH_NOT_ALLOWED");
        }
        if (openedStatus.size > BigInt(config.maxImageBytes)) {
          return imageFailure("FILE_TOO_LARGE");
        }

        const readResult = await readFileBounded(handle, config.maxImageBytes, signal);
        if (readResult.kind === "cancelled") {
          return imageFailure("CANCELLED");
        }
        if (readResult.kind === "too-large") {
          return imageFailure("FILE_TOO_LARGE");
        }

        const image = Object.freeze({
          bytes: readResult.bytes,
          originalBytes: readResult.bytes.byteLength,
        });
        return imageSuccess(image);
      } catch (error: unknown) {
        return fileAccessFailure(error);
      } finally {
        await handle.close().catch(() => undefined);
      }
    },
  });
}
