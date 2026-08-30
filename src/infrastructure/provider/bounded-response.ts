export type BoundedResponseBody =
  | Readonly<{ bytes: Uint8Array; kind: "ok" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "too-large" }>;

type BodyChunk = Readonly<{ done: false; value: Uint8Array }> | Readonly<{ done: true }>;

function bodyChunk(value: unknown): BodyChunk | undefined {
  if (typeof value !== "object" || value === null || !("done" in value)) {
    return undefined;
  }
  if (value.done === true) {
    return Object.freeze({ done: true });
  }
  if (value.done === false && "value" in value && value.value instanceof Uint8Array) {
    return Object.freeze({ done: false, value: value.value });
  }
  return undefined;
}

function declaredLength(response: Response): number | undefined {
  const value = response.headers.get("content-length");
  if (value === null || !/^\d+$/u.test(value)) {
    return undefined;
  }

  const length = Number(value);
  return Number.isSafeInteger(length) ? length : undefined;
}

export async function readBoundedResponseBody(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<BoundedResponseBody> {
  const length = declaredLength(response);
  if (length !== undefined && length > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return Object.freeze({ kind: "too-large" });
  }
  if (response.body === null) {
    return Object.freeze({ kind: "invalid" });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined);
        return Object.freeze({ kind: "cancelled" });
      }

      const chunk = bodyChunk(await reader.read());
      if (chunk === undefined) {
        return Object.freeze({ kind: "invalid" });
      }
      if (chunk.done) {
        return Object.freeze({
          bytes: Buffer.concat(chunks.map((value) => Buffer.from(value))),
          kind: "ok",
        });
      }

      totalBytes += chunk.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return Object.freeze({ kind: "too-large" });
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
}
