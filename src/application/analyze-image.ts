import { randomUUID } from "node:crypto";

import type { ProviderConfig } from "../config.js";
import {
  analyzeImageFailure,
  applicationError,
  type AnalyzeImageError,
  type AnalyzeImageErrorCode,
  type AnalyzeImageRequest,
  type AnalyzeImageResult,
  type AnalyzeImageService,
} from "../domain/analyze-image.js";
import type { ImagePipeline, InputGuard, PreparedImage } from "../domain/image.js";
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

export interface AnalyzeImageOptions {
  readonly now?: () => number;
  readonly requestId?: () => string;
}

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

export function createAnalyzeImageService(
  dependencies: AnalyzeImageDependencies,
  config: Pick<ProviderConfig, "requestTimeoutMs">,
  options: AnalyzeImageOptions = {},
): AnalyzeImageService {
  const now = options.now ?? Date.now;
  const nextRequestId = options.requestId ?? randomUUID;

  return Object.freeze({
    async analyze(request: AnalyzeImageRequest): Promise<AnalyzeImageResult> {
      const requestId = nextRequestId();
      const startedAt = now();
      const deadlineController = new AbortController();
      const deadlineTimer = setTimeout(() => {
        deadlineController.abort();
      }, config.requestTimeoutMs);
      deadlineTimer.unref();
      const signal = AbortSignal.any([request.signal, deadlineController.signal]);
      let errorCode: AnalyzeImageErrorCode | undefined;
      let queueDurationMs = 0;

      try {
        if (
          request.path.length === 0 ||
          request.prompt.length === 0 ||
          request.prompt.length > 8_000
        ) {
          const error = applicationError("INVALID_INPUT");
          errorCode = error.code;
          return analyzeImageFailure(requestId, error);
        }

        const acquired = await dependencies.queue.acquire(signal);
        queueDurationMs = Math.max(0, now() - startedAt);
        if (acquired.kind === "full") {
          const error = applicationError("QUEUE_FULL");
          errorCode = error.code;
          return analyzeImageFailure(requestId, error);
        }
        if (acquired.kind === "cancelled") {
          const error =
            interruptedError(request.signal, deadlineController.signal) ??
            resultError("CANCELLED", "The request was cancelled.", false);
          errorCode = error.code;
          return analyzeImageFailure(requestId, error);
        }

        try {
          const interrupted = interruptedError(request.signal, deadlineController.signal);
          if (interrupted !== undefined) {
            errorCode = interrupted.code;
            return analyzeImageFailure(requestId, interrupted);
          }

          const authorized = await dependencies.inputGuard.readAuthorizedImage(
            request.path,
            signal,
          );
          if (!authorized.ok) {
            const effective =
              interruptedError(request.signal, deadlineController.signal) ?? authorized.error;
            errorCode = effective.code;
            return analyzeImageFailure(requestId, effective);
          }

          const prepared = await dependencies.pipeline.prepare(authorized.value, signal);
          if (!prepared.ok) {
            const effective =
              interruptedError(request.signal, deadlineController.signal) ?? prepared.error;
            errorCode = effective.code;
            return analyzeImageFailure(requestId, effective);
          }

          const response = await dependencies.provider.analyze({
            image: prepared.value,
            prompt: request.prompt,
            signal,
          });
          if (!response.ok) {
            const effective =
              interruptedError(request.signal, deadlineController.signal) ?? response.error;
            errorCode = effective.code;
            return analyzeImageFailure(requestId, effective);
          }

          const interruptedAfterProvider = interruptedError(
            request.signal,
            deadlineController.signal,
          );
          if (interruptedAfterProvider !== undefined) {
            errorCode = interruptedAfterProvider.code;
            return analyzeImageFailure(requestId, interruptedAfterProvider);
          }

          return successfulResult(requestId, prepared.value, response.value);
        } finally {
          acquired.lease.release();
        }
      } catch {
        const interrupted = interruptedError(request.signal, deadlineController.signal);
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
          dependencies.logger.info("Image analysis completed", context);
        } else {
          dependencies.logger.warn("Image analysis failed", context);
        }
      }
    },
  });
}
