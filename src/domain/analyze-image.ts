import type { ImageErrorCode } from "./image.js";
import type { ProviderErrorCode, VisionUsage } from "./provider.js";

export type AnalyzeImageErrorCode =
  "INVALID_INPUT" | "QUEUE_FULL" | ImageErrorCode | ProviderErrorCode;

export interface AnalyzeImageError {
  readonly code: AnalyzeImageErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface AnalyzeImageFailure {
  readonly error: AnalyzeImageError;
  readonly requestId: string;
  readonly schemaVersion: "1";
  readonly status: "error";
}

export interface AnalyzeImageSuccess {
  readonly answer: string;
  readonly media: Readonly<{
    height: number;
    mimeType: "image/jpeg" | "image/png";
    originalBytes: number;
    transformed: boolean;
    transmittedBytes: number;
    width: number;
  }>;
  readonly provider: Readonly<{
    model: string;
    name: "openai-compatible";
  }>;
  readonly requestId: string;
  readonly schemaVersion: "1";
  readonly status: "ok";
  readonly usage?: VisionUsage;
  readonly warnings: readonly "ANSWER_TRUNCATED"[];
}

export type AnalyzeImageResult = AnalyzeImageFailure | AnalyzeImageSuccess;

export interface AnalyzeImageRequest {
  readonly path: string;
  readonly prompt: string;
  readonly signal: AbortSignal;
}

export interface AnalyzeImageService {
  readonly analyze: (request: AnalyzeImageRequest) => Promise<AnalyzeImageResult>;
}

const applicationErrors: Readonly<
  Record<"INVALID_INPUT" | "QUEUE_FULL", Readonly<{ message: string; retryable: boolean }>>
> = Object.freeze({
  INVALID_INPUT: Object.freeze({ message: "The tool input is invalid.", retryable: false }),
  QUEUE_FULL: Object.freeze({
    message: "The local analysis queue is full.",
    retryable: true,
  }),
});

export function applicationError(code: "INVALID_INPUT" | "QUEUE_FULL"): AnalyzeImageError {
  const definition = applicationErrors[code];
  return Object.freeze({ code, message: definition.message, retryable: definition.retryable });
}

export function analyzeImageFailure(
  requestId: string,
  error: AnalyzeImageError,
): AnalyzeImageFailure {
  return Object.freeze({
    error: Object.freeze(error),
    requestId,
    schemaVersion: "1",
    status: "error",
  });
}
