import { Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  createAnalyzeClipboardImageService,
  createAnalyzeImageService,
} from "../../src/application/analyze-image.js";
import { createBoundedWorkQueue } from "../../src/application/bounded-work-queue.js";
import type {
  AnalyzeClipboardImageDependencies,
  AnalyzeImageDependencies,
} from "../../src/application/analyze-image.js";
import {
  imageFailure,
  imageSuccess,
  type AuthorizedImage,
  type ClipboardImageReader,
  type PreparedImage,
} from "../../src/domain/image.js";
import {
  providerFailure,
  providerSuccess,
  type VisionProvider,
} from "../../src/domain/provider.js";
import { createLogger } from "../../src/logger.js";

const authorizedImage: AuthorizedImage = Object.freeze({
  bytes: Uint8Array.from([1, 2, 3]),
  originalBytes: 3,
});
const preparedImage: PreparedImage = Object.freeze({
  bytes: Uint8Array.from([4, 5]),
  height: 10,
  mimeType: "image/jpeg",
  originalBytes: 3,
  transformed: true,
  width: 20,
});
const silentLogger = Object.freeze({
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
});

function dependencies(overrides: Partial<AnalyzeImageDependencies> = {}): AnalyzeImageDependencies {
  return {
    inputGuard: {
      readAuthorizedImage: () => Promise.resolve(imageSuccess(authorizedImage)),
    },
    logger: silentLogger,
    pipeline: {
      prepare: () => Promise.resolve(imageSuccess(preparedImage)),
    },
    provider: {
      analyze: () =>
        Promise.resolve(
          providerSuccess({
            model: "vision-model",
            providerName: "openai-compatible",
            text: "A safe description.",
            usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
            warnings: ["ANSWER_TRUNCATED"],
          }),
        ),
    },
    queue: createBoundedWorkQueue(1, 1),
    ...overrides,
  };
}

function request(signal: AbortSignal = new AbortController().signal) {
  return { path: "/authorized/image.png", prompt: "Describe it", signal };
}

function clipboardDependencies(
  overrides: Partial<AnalyzeClipboardImageDependencies> = {},
): AnalyzeClipboardImageDependencies {
  return {
    clipboardReader: {
      read: () => Promise.resolve(imageSuccess(authorizedImage)),
    },
    logger: silentLogger,
    pipeline: {
      prepare: () => Promise.resolve(imageSuccess(preparedImage)),
    },
    provider: {
      analyze: () =>
        Promise.resolve(
          providerSuccess({
            model: "vision-model",
            providerName: "openai-compatible",
            text: "A safe description.",
            usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
            warnings: ["ANSWER_TRUNCATED"],
          }),
        ),
    },
    queue: createBoundedWorkQueue(1, 1),
    ...overrides,
  };
}

function clipboardRequest(signal: AbortSignal = new AbortController().signal) {
  return { prompt: "Describe the clipboard", signal };
}

describe("AnalyzeImage service", () => {
  it("rejects invalid input before consuming local work capacity", async () => {
    const queue = { acquire: vi.fn(() => Promise.resolve({ kind: "full" as const })) };
    const service = createAnalyzeImageService(
      dependencies({ queue }),
      { requestTimeoutMs: 1_000 },
      {
        requestId: () => "request-invalid",
      },
    );

    await expect(
      service.analyze({ path: "", prompt: "Describe it", signal: request().signal }),
    ).resolves.toMatchObject({
      error: { code: "INVALID_INPUT", retryable: false },
      requestId: "request-invalid",
      status: "error",
    });
    expect(queue.acquire).not.toHaveBeenCalled();
  });

  it("orchestrates the ports and returns locally generated structured metadata", async () => {
    const provider = vi.fn<VisionProvider["analyze"]>(() =>
      Promise.resolve(
        providerSuccess({
          model: "vision-model",
          providerName: "openai-compatible" as const,
          text: "A safe description.",
          usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
          warnings: ["ANSWER_TRUNCATED"] as const,
        }),
      ),
    );
    const service = createAnalyzeImageService(
      dependencies({ provider: { analyze: provider } }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-1" },
    );

    await expect(service.analyze(request())).resolves.toEqual({
      answer: "A safe description.",
      media: {
        height: 10,
        mimeType: "image/jpeg",
        originalBytes: 3,
        transformed: true,
        transmittedBytes: 2,
        width: 20,
      },
      provider: { model: "vision-model", name: "openai-compatible" },
      requestId: "request-1",
      schemaVersion: "1",
      status: "ok",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      warnings: ["ANSWER_TRUNCATED"],
    });
    expect(provider).toHaveBeenCalledOnce();
    const providerRequest = provider.mock.calls[0]?.[0];
    expect(providerRequest).toMatchObject({ image: preparedImage, prompt: "Describe it" });
    expect(providerRequest?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    "PATH_NOT_ABSOLUTE",
    "PATH_NOT_ALLOWED",
    "FILE_NOT_FOUND",
    "FILE_NOT_REGULAR",
    "FILE_TOO_LARGE",
    "CANCELLED",
    "INTERNAL_ERROR",
  ] as const)("maps input guard error %s without throwing", async (code) => {
    const service = createAnalyzeImageService(
      dependencies({
        inputGuard: { readAuthorizedImage: () => Promise.resolve(imageFailure(code)) },
      }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-error" },
    );

    const result = await service.analyze(request());
    expect(result).toMatchObject({ error: { code }, requestId: "request-error", status: "error" });
  });

  it.each([
    "UNSUPPORTED_MEDIA",
    "IMAGE_TOO_LARGE",
    "IMAGE_DECODE_FAILED",
    "FILE_TOO_LARGE",
    "CANCELLED",
    "INTERNAL_ERROR",
  ] as const)("maps image pipeline error %s without calling the provider", async (code) => {
    const provider = vi.fn();
    const service = createAnalyzeImageService(
      dependencies({
        pipeline: { prepare: () => Promise.resolve(imageFailure(code)) },
        provider: { analyze: provider },
      }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-error" },
    );

    const result = await service.analyze(request());
    expect(result).toMatchObject({ error: { code }, status: "error" });
    expect(provider).not.toHaveBeenCalled();
  });

  it.each([
    "PROVIDER_AUTHENTICATION",
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_TIMEOUT",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_RESPONSE_INVALID",
    "OUTPUT_TOO_LARGE",
    "CANCELLED",
    "INTERNAL_ERROR",
  ] as const)("maps provider error %s without exposing an exception", async (code) => {
    const service = createAnalyzeImageService(
      dependencies({ provider: { analyze: () => Promise.resolve(providerFailure(code)) } }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-error" },
    );

    const result = await service.analyze(request());
    expect(result).toMatchObject({ error: { code }, status: "error" });
  });

  it("returns QUEUE_FULL when bounded capacity is exhausted", async () => {
    let finishFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const queue = createBoundedWorkQueue(1, 0);
    const service = createAnalyzeImageService(
      dependencies({
        inputGuard: {
          readAuthorizedImage: async () => {
            await firstBlocked;
            return imageSuccess(authorizedImage);
          },
        },
        queue,
      }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-queue" },
    );

    const first = service.analyze(request());
    await vi.waitFor(() => {
      expect(finishFirst).toBeTypeOf("function");
    });
    await expect(service.analyze(request())).resolves.toMatchObject({
      error: { code: "QUEUE_FULL", retryable: true },
      status: "error",
    });
    finishFirst?.();
    await expect(first).resolves.toMatchObject({ status: "ok" });
  });

  it("cancels a queued call and remains healthy for the next call", async () => {
    let finishFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    let calls = 0;
    const service = createAnalyzeImageService(
      dependencies({
        inputGuard: {
          readAuthorizedImage: async () => {
            calls += 1;
            if (calls === 1) {
              await firstBlocked;
            }
            return imageSuccess(authorizedImage);
          },
        },
        queue: createBoundedWorkQueue(1, 1),
      }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => `request-${String(calls)}` },
    );

    const first = service.analyze(request());
    const controller = new AbortController();
    const queued = service.analyze(request(controller.signal));
    controller.abort();
    await expect(queued).resolves.toMatchObject({ error: { code: "CANCELLED" }, status: "error" });
    finishFirst?.();
    await first;
    await expect(service.analyze(request())).resolves.toMatchObject({ status: "ok" });
  });

  it("maps its overall deadline to PROVIDER_TIMEOUT across preprocessing", async () => {
    const service = createAnalyzeImageService(
      dependencies({
        inputGuard: {
          readAuthorizedImage: async (_path, signal) =>
            new Promise((resolve) => {
              signal.addEventListener(
                "abort",
                () => {
                  resolve(imageFailure("CANCELLED"));
                },
                { once: true },
              );
            }),
        },
      }),
      { requestTimeoutMs: 10 },
      { requestId: () => "request-timeout" },
    );

    await expect(service.analyze(request())).resolves.toMatchObject({
      error: { code: "PROVIDER_TIMEOUT", retryable: true },
      status: "error",
    });
  });

  it("[LOG-01] sanitizes unexpected errors and never logs path, prompt, or cause", async () => {
    const canary = "private-path-prompt-cause-canary";
    let logs = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        logs += String(chunk);
        callback();
      },
    });
    const service = createAnalyzeImageService(
      dependencies({
        inputGuard: {
          readAuthorizedImage: () => Promise.reject(new Error(canary)),
        },
        logger: createLogger("debug", { destination }),
      }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-sanitized" },
    );

    const result = await service.analyze({
      path: canary,
      prompt: canary,
      signal: request().signal,
    });
    expect(result).toMatchObject({ error: { code: "INTERNAL_ERROR" }, status: "error" });
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(logs).not.toContain(canary);
    expect(logs).toContain("request-sanitized");
  });
});

describe("AnalyzeClipboardImage service", () => {
  it("reads the clipboard and returns locally generated structured metadata", async () => {
    const read = vi.fn<ClipboardImageReader["read"]>(() =>
      Promise.resolve(imageSuccess(authorizedImage)),
    );
    const service = createAnalyzeClipboardImageService(
      clipboardDependencies({ clipboardReader: { read } }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-clipboard" },
    );

    await expect(service.analyze(clipboardRequest())).resolves.toMatchObject({
      answer: "A safe description.",
      media: { transmittedBytes: 2 },
      provider: { model: "vision-model", name: "openai-compatible" },
      requestId: "request-clipboard",
      status: "ok",
    });
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it("maps clipboard access denial without calling the provider", async () => {
    const provider = vi.fn<VisionProvider["analyze"]>();
    const service = createAnalyzeClipboardImageService(
      clipboardDependencies({
        clipboardReader: {
          read: () => Promise.resolve(imageFailure("CLIPBOARD_ACCESS_DENIED")),
        },
        provider: { analyze: provider },
      }),
      { requestTimeoutMs: 1_000 },
      { requestId: () => "request-denied" },
    );

    await expect(service.analyze(clipboardRequest())).resolves.toMatchObject({
      error: { code: "CLIPBOARD_ACCESS_DENIED" },
      requestId: "request-denied",
      status: "error",
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it.each(["CLIPBOARD_NO_IMAGE", "CLIPBOARD_READ_FAILED", "CLIPBOARD_UNAVAILABLE"] as const)(
    "maps clipboard reader error %s without throwing",
    async (code) => {
      const service = createAnalyzeClipboardImageService(
        clipboardDependencies({
          clipboardReader: { read: () => Promise.resolve(imageFailure(code)) },
        }),
        { requestTimeoutMs: 1_000 },
        { requestId: () => "request-error" },
      );

      await expect(service.analyze(clipboardRequest())).resolves.toMatchObject({
        error: { code },
        requestId: "request-error",
        status: "error",
      });
    },
  );
});
