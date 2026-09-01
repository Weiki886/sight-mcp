import { randomUUID } from "node:crypto";

import type { ProviderConfig } from "../config.js";
import {
  analyzeImageFailure,
  applicationError,
  type AnalyzeClipboardImageRequest,
  type AnalyzeClipboardImageService,
  type AnalyzeImageError,
  type AnalyzeImageErrorCode,
  type AnalyzeImageRequest,
  type AnalyzeImageResult,
  type AnalyzeImageService,
} from "../domain/analyze-image.js";
import type {
  AuthorizedImage,
  ClipboardImageReader,
  ImagePipeline,
  ImageResult,
  InputGuard,
  PreparedImage,
} from "../domain/image.js";
import type { VisionProvider, VisionResponse } from "../domain/provider.js";
import type { Logger } from "../logger.js";
import type { BoundedWorkQueue } from "./bounded-work-queue.js";

export interface AnalyzeImageDependencies {
  readonly inputGuard: InputGuard;
  readonly logger: Logger;
  readonly pipeline: ImagePipeline;
  readonly provider: VisionProvider;
  readonly queue: BoundedWorkQueue;
}

export interface AnalyzeClipboardImageDependencies {
  readonly clipboardReader: ClipboardImageReader;
  readonly logger: Logger;
  readonly pipeline: ImagePipeline;
  readonly provider: VisionProvider;
  readonly queue: BoundedWorkQueue;
}

export interface AnalyzeImageOptions {
  readonly now?: () => number;
  readonly requestId?: () => string;
}

interface AnalysisInfrastructure {
  readonly logger: Logger;
  readonly pipeline: ImagePipeline;
  readonly provider: VisionProvider;
  readonly queue: BoundedWorkQueue;
}

type ImageReader = (signal: AbortSignal) => Promise<ImageResult<AuthorizedImage>>;

function resultError(code: AnalyzeImageErrorCode, message: string, retryable: boolean) {
  return Object.freeze({ code, message, retryable });
}

function interruptedError(
  requestSignal: AbortSignal,
  deadlineSignal: AbortSignal,
): AnalyzeImageError | undefined {
  if (requestSignal.aborted) {
    return resultError("CANCELLED", "The request was cancelled.", false);
  }
  if (deadlineSignal.aborted) {
    return resultError("PROVIDER_TIMEOUT", "The request exceeded its deadline.", true);
  }
  return undefined;
}

function successfulResult(
  requestId: string,
  image: PreparedImage,
  response: VisionResponse,
): AnalyzeImageResult {
  return Object.freeze({
    answer: response.text,
    media: Object.freeze({
      height: image.height,
      mimeType: image.mimeType,
      originalBytes: image.originalBytes,
      transformed: image.transformed,
      transmittedBytes: image.bytes.byteLength,
      width: image.width,
    }),
    provider: Object.freeze({ model: response.model, name: response.providerName }),
    requestId,
    schemaVersion: "1",
    status: "ok",
    ...(response.usage === undefined ? {} : { usage: Object.freeze(response.usage) }),
    warnings: Object.freeze([...response.warnings]),
  });
}

async function analyzeFromImageSource(
  infrastructure: AnalysisInfrastructure,
  config: Pick<ProviderConfig, "requestTimeoutMs">,
  prompt: string,
  requestSignal: AbortSignal,
  readImage: ImageReader,
  now: () => number,
  requestId: string,
): Promise<AnalyzeImageResult> {
  const startedAt = now();
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadlineController.abort();
  }, config.requestTimeoutMs);
  deadlineTimer.unref();
  const signal = AbortSignal.any([requestSignal, deadlineController.signal]);
  let errorCode: AnalyzeImageErrorCode | undefined;
  let queueDurationMs = 0;

  try {
    if (prompt.length === 0 || prompt.length > 8_000) {
      const error = applicationError("INVALID_INPUT");
      errorCode = error.code;
      return analyzeImageFailure(requestId, error);
    }

    const acquired = await infrastructure.queue.acquire(signal);
    queueDurationMs = Math.max(0, now() - startedAt);
    if (acquired.kind === "full") {
      const error = applicationError("QUEUE_FULL");
      errorCode = error.code;
      return analyzeImageFailure(requestId, error);
    }
    if (acquired.kind === "cancelled") {
      const error =
        interruptedError(requestSignal, deadlineController.signal) ??
        resultError("CANCELLED", "The request was cancelled.", false);
      errorCode = error.code;
      return analyzeImageFailure(requestId, error);
    }

    try {
      const interrupted = interruptedError(requestSignal, deadlineController.signal);
      if (interrupted !== undefined) {
        errorCode = interrupted.code;
        return analyzeImageFailure(requestId, interrupted);
      }

      const authorized = await readImage(signal);
      if (!authorized.ok) {
        const effective =
          interruptedError(requestSignal, deadlineController.signal) ?? authorized.error;
        errorCode = effective.code;
        return analyzeImageFailure(requestId, effective);
      }

      const prepared = await infrastructure.pipeline.prepare(authorized.value, signal);
      if (!prepared.ok) {
        const effective =
          interruptedError(requestSignal, deadlineController.signal) ?? prepared.error;
        errorCode = effective.code;
        return analyzeImageFailure(requestId, effective);
      }

      const response = await infrastructure.provider.analyze({
        image: prepared.value,
        prompt,
        signal,
      });
      if (!response.ok) {
        const effective =
          interruptedError(requestSignal, deadlineController.signal) ?? response.error;
        errorCode = effective.code;
        return analyzeImageFailure(requestId, effective);
      }

      const interruptedAfterProvider = interruptedError(requestSignal, deadlineController.signal);
      if (interruptedAfterProvider !== undefined) {
        errorCode = interruptedAfterProvider.code;
        return analyzeImageFailure(requestId, interruptedAfterProvider);
      }

      return successfulResult(requestId, prepared.value, response.value);
    } finally {
      acquired.lease.release();
    }
  } catch {
    const interrupted = interruptedError(requestSignal, deadlineController.signal);
    const error =
      interrupted ??
      resultError(
        "INTERNAL_ERROR",
        "The image analysis failed because of an internal error.",
        false,
      );
    errorCode = error.code;
    return analyzeImageFailure(requestId, error);
  } finally {
    clearTimeout(deadlineTimer);
    const context = {
      durationMs: Math.max(0, now() - startedAt),
      ...(errorCode === undefined ? {} : { errorCode }),
      queueDurationMs,
      requestId,
    };
    if (errorCode === undefined) {
      infrastructure.logger.info("Image analysis completed", context);
    } else {
      infrastructure.logger.warn("Image analysis failed", context);
    }
  }
}

export function createAnalyzeImageService(
  dependencies: AnalyzeImageDependencies,
  config: Pick<ProviderConfig, "requestTimeoutMs">,
  options: AnalyzeImageOptions = {},
): AnalyzeImageService {
  const now = options.now ?? Date.now;
  const nextRequestId = options.requestId ?? randomUUID;
  const infrastructure: AnalysisInfrastructure = {
    logger: dependencies.logger,
    pipeline: dependencies.pipeline,
    provider: dependencies.provider,
    queue: dependencies.queue,
  };

  return Object.freeze({
    async analyze(request: AnalyzeImageRequest): Promise<AnalyzeImageResult> {
      const requestId = nextRequestId();
      if (request.path.length === 0) {
        return analyzeImageFailure(requestId, applicationError("INVALID_INPUT"));
      }

      return analyzeFromImageSource(
        infrastructure,
        config,
        request.prompt,
        request.signal,
        (signal) => dependencies.inputGuard.readAuthorizedImage(request.path, signal),
        now,
        requestId,
      );
    },
  });
}

export function createAnalyzeClipboardImageService(
  dependencies: AnalyzeClipboardImageDependencies,
  config: Pick<ProviderConfig, "requestTimeoutMs">,
  options: AnalyzeImageOptions = {},
): AnalyzeClipboardImageService {
  const now = options.now ?? Date.now;
  const nextRequestId = options.requestId ?? randomUUID;
  const infrastructure: AnalysisInfrastructure = {
    logger: dependencies.logger,
    pipeline: dependencies.pipeline,
    provider: dependencies.provider,
    queue: dependencies.queue,
  };

  return Object.freeze({
    async analyze(request: AnalyzeClipboardImageRequest): Promise<AnalyzeImageResult> {
      const requestId = nextRequestId();
      return analyzeFromImageSource(
        infrastructure,
        config,
        request.prompt,
        request.signal,
        (signal) => dependencies.clipboardReader.read(signal),
        now,
        requestId,
      );
    },
  });
}
