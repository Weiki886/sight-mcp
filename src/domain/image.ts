export type ImageErrorCode =
  | "CANCELLED"
  | "CLIPBOARD_ACCESS_DENIED"
  | "CLIPBOARD_NO_IMAGE"
  | "CLIPBOARD_READ_FAILED"
  | "CLIPBOARD_UNAVAILABLE"
  | "FILE_NOT_FOUND"
  | "FILE_NOT_REGULAR"
  | "FILE_TOO_LARGE"
  | "IMAGE_DECODE_FAILED"
  | "IMAGE_TOO_LARGE"
  | "INTERNAL_ERROR"
  | "PATH_NOT_ABSOLUTE"
  | "PATH_NOT_ALLOWED"
  | "UNSUPPORTED_MEDIA";

export interface ImageError {
  readonly code: ImageErrorCode;
  readonly message: string;
  readonly retryable: false;
}

export type ImageResult<Value> =
  Readonly<{ ok: true; value: Value }> | Readonly<{ error: ImageError; ok: false }>;

export interface AuthorizedImage {
  readonly bytes: Uint8Array;
  readonly originalBytes: number;
}

export interface PreparedImage {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: "image/jpeg" | "image/png";
  readonly originalBytes: number;
  readonly transformed: boolean;
  readonly width: number;
}

export interface InputGuard {
  readonly readAuthorizedImage: (
    inputPath: string,
    signal: AbortSignal,
  ) => Promise<ImageResult<AuthorizedImage>>;
}

export interface ClipboardImageReader {
  readonly read: (signal: AbortSignal) => Promise<ImageResult<AuthorizedImage>>;
}

export interface ImagePipeline {
  readonly prepare: (
    image: AuthorizedImage,
    signal: AbortSignal,
  ) => Promise<ImageResult<PreparedImage>>;
}

const errorMessages: Readonly<Record<ImageErrorCode, string>> = Object.freeze({
  CANCELLED: "The image operation was cancelled.",
  CLIPBOARD_ACCESS_DENIED: "Clipboard image access was denied or cancelled by the user.",
  CLIPBOARD_NO_IMAGE: "The clipboard does not contain an image.",
  CLIPBOARD_READ_FAILED: "The clipboard image could not be read.",
  CLIPBOARD_UNAVAILABLE: "Clipboard image reading is unavailable on this platform.",
  FILE_NOT_FOUND: "The image file does not exist.",
  FILE_NOT_REGULAR: "The image path is not a regular file.",
  FILE_TOO_LARGE: "The image file exceeds the configured byte limit.",
  IMAGE_DECODE_FAILED: "The image could not be decoded safely.",
  IMAGE_TOO_LARGE: "The image exceeds the configured processing limits.",
  INTERNAL_ERROR: "The image could not be processed because of an internal error.",
  PATH_NOT_ABSOLUTE: "The image path must be absolute.",
  PATH_NOT_ALLOWED: "The image is outside the configured allowed roots.",
  UNSUPPORTED_MEDIA: "Only PNG, JPEG, and WebP images are supported.",
});

export function imageFailure<Value>(code: ImageErrorCode): ImageResult<Value> {
  return Object.freeze({
    error: Object.freeze({ code, message: errorMessages[code], retryable: false }),
    ok: false,
  });
}

export function imageSuccess<Value>(value: Value): ImageResult<Value> {
  return Object.freeze({ ok: true, value });
}
