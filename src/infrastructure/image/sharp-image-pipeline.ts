import sharp, { type OutputInfo } from "sharp";

import type { ImageConfig } from "../../config.js";
import {
  imageFailure,
  imageSuccess,
  type AuthorizedImage,
  type ImagePipeline,
  type ImageResult,
  type PreparedImage,
} from "../../domain/image.js";
import { detectMediaSignature, type SupportedImageFormat } from "./media-signature.js";

sharp.cache(false);

type PipelineConfig = Pick<
  ImageConfig,
  | "jpegQuality"
  | "maxImageBytes"
  | "maxImageDimension"
  | "maxImagePixels"
  | "maxTransmitBytes"
  | "transmitMaxDimension"
>;

const minimumJpegQuality = 40;
const maximumEncodeAttempts = 12;

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function exceedsPixelLimits(width: number, height: number, config: PipelineConfig): boolean {
  return (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > config.maxImageDimension ||
    height > config.maxImageDimension ||
    width > Math.floor(config.maxImagePixels / height)
  );
}

function formatMatches(signatureFormat: SupportedImageFormat, decodedFormat: string): boolean {
  return signatureFormat === decodedFormat;
}

interface EncodeOptions {
  readonly hasAlpha: boolean;
  readonly maximumDimension: number;
  readonly quality: number;
}

async function encode(
  source: Buffer,
  config: PipelineConfig,
  options: EncodeOptions,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const operation = sharp(source, {
    failOn: "warning",
    limitInputChannels: 4,
    limitInputPixels: config.maxImagePixels,
    pages: 1,
    sequentialRead: true,
    unlimited: false,
  })
    .autoOrient()
    .resize({
      fit: "inside",
      height: options.maximumDimension,
      width: options.maximumDimension,
      withoutEnlargement: true,
    })
    .toColorspace("srgb");

  const encoder = options.hasAlpha
    ? operation.png({ adaptiveFiltering: true, compressionLevel: 9, palette: false })
    : operation.jpeg({
        chromaSubsampling: "4:4:4",
        optimizeCoding: true,
        progressive: false,
        quality: options.quality,
      });

  return encoder.toBuffer({ resolveWithObject: true });
}

function nextDimension(current: number, outputBytes: number, maximumBytes: number): number {
  const ratio = Math.sqrt(maximumBytes / outputBytes) * 0.9;
  return Math.max(1, Math.min(current - 1, Math.floor(current * ratio)));
}

export function createSharpImagePipeline(config: PipelineConfig): ImagePipeline {
  return Object.freeze({
    async prepare(
      image: AuthorizedImage,
      signal: AbortSignal,
    ): Promise<ImageResult<PreparedImage>> {
      if (isAborted(signal)) {
        return imageFailure("CANCELLED");
      }
      if (
        image.bytes.byteLength > config.maxImageBytes ||
        image.originalBytes > config.maxImageBytes
      ) {
        return imageFailure("FILE_TOO_LARGE");
      }

      const signature = detectMediaSignature(image.bytes);
      if (signature === undefined) {
        return imageFailure("UNSUPPORTED_MEDIA");
      }
      if (
        signature.width !== undefined &&
        signature.height !== undefined &&
        exceedsPixelLimits(signature.width, signature.height, config)
      ) {
        return imageFailure("IMAGE_TOO_LARGE");
      }

      const source = Buffer.from(image.bytes);
      try {
        const metadata = await sharp(source, {
          failOn: "warning",
          limitInputChannels: 4,
          limitInputPixels: config.maxImagePixels,
          pages: 1,
          sequentialRead: true,
          unlimited: false,
        }).metadata();

        if (isAborted(signal)) {
          return imageFailure("CANCELLED");
        }
        if (!formatMatches(signature.format, metadata.format) || (metadata.pages ?? 1) > 1) {
          return imageFailure("IMAGE_DECODE_FAILED");
        }

        const orientedWidth = metadata.autoOrient.width;
        const orientedHeight = metadata.autoOrient.height;
        if (exceedsPixelLimits(orientedWidth, orientedHeight, config)) {
          return imageFailure("IMAGE_TOO_LARGE");
        }

        let maximumDimension = Math.min(
          config.transmitMaxDimension,
          Math.max(orientedWidth, orientedHeight),
        );
        let quality = config.jpegQuality;

        for (let attempt = 0; attempt < maximumEncodeAttempts; attempt += 1) {
          if (isAborted(signal)) {
            return imageFailure("CANCELLED");
          }

          const output = await encode(source, config, {
            hasAlpha: metadata.hasAlpha,
            maximumDimension,
            quality,
          });

          if (isAborted(signal)) {
            return imageFailure("CANCELLED");
          }
          if (output.data.byteLength <= config.maxTransmitBytes) {
            const prepared = Object.freeze({
              bytes: output.data,
              height: output.info.height,
              mimeType: metadata.hasAlpha ? "image/png" : "image/jpeg",
              originalBytes: image.originalBytes,
              transformed: true,
              width: output.info.width,
            } satisfies PreparedImage);
            return imageSuccess(prepared);
          }

          if (!metadata.hasAlpha && quality > minimumJpegQuality) {
            quality = Math.max(minimumJpegQuality, quality - 15);
            continue;
          }

          if (maximumDimension <= 1) {
            return imageFailure("IMAGE_TOO_LARGE");
          }
          maximumDimension = nextDimension(
            maximumDimension,
            output.data.byteLength,
            config.maxTransmitBytes,
          );
        }

        return imageFailure("IMAGE_TOO_LARGE");
      } catch {
        return isAborted(signal) ? imageFailure("CANCELLED") : imageFailure("IMAGE_DECODE_FAILED");
      }
    },
  });
}
