import type { PreparedImage } from "./image.js";

export type ProviderErrorCode =
  | "CANCELLED"
  | "INTERNAL_ERROR"
  | "OUTPUT_TOO_LARGE"
  | "PROVIDER_AUTHENTICATION"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE";

export interface ProviderError {
  readonly code: ProviderErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type ProviderResult<Value> =
  Readonly<{ ok: true; value: Value }> | Readonly<{ error: ProviderError; ok: false }>;

export interface VisionUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface VisionRequest {
  readonly image: PreparedImage;
  readonly prompt: string;
  readonly signal: AbortSignal;
}

export interface VisionResponse {
  readonly model: string;
  readonly providerName: "openai-compatible";
  readonly text: string;
  readonly usage?: VisionUsage;
  readonly warnings: readonly "ANSWER_TRUNCATED"[];
}

export interface VisionProvider {
  readonly analyze: (request: VisionRequest) => Promise<ProviderResult<VisionResponse>>;
}

const providerErrors: Readonly<
  Record<ProviderErrorCode, Readonly<{ message: string; retryable: boolean }>>
> = Object.freeze({
  CANCELLED: Object.freeze({ message: "The provider request was cancelled.", retryable: false }),
  INTERNAL_ERROR: Object.freeze({
    message: "The provider request failed because of an internal error.",
    retryable: false,
  }),
  OUTPUT_TOO_LARGE: Object.freeze({
    message: "The provider response exceeds the configured byte limit.",
    retryable: false,
  }),
  PROVIDER_AUTHENTICATION: Object.freeze({
    message: "The provider rejected its configured credentials.",
    retryable: false,
  }),
  PROVIDER_RATE_LIMITED: Object.freeze({
    message: "The provider rate limit was reached.",
    retryable: true,
  }),
  PROVIDER_RESPONSE_INVALID: Object.freeze({
    message: "The provider returned an invalid response.",
    retryable: false,
  }),
  PROVIDER_TIMEOUT: Object.freeze({
    message: "The provider request exceeded its deadline.",
    retryable: true,
  }),
  PROVIDER_UNAVAILABLE: Object.freeze({
    message: "The provider is temporarily unavailable.",
    retryable: true,
  }),
});

export function providerFailure<Value>(code: ProviderErrorCode): ProviderResult<Value> {
  const definition = providerErrors[code];
  return Object.freeze({
    error: Object.freeze({ code, message: definition.message, retryable: definition.retryable }),
    ok: false,
  });
}

export function providerSuccess<Value>(value: Value): ProviderResult<Value> {
  return Object.freeze({ ok: true, value });
}
