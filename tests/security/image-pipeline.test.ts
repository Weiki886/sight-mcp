import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { AuthorizedImage } from "../../src/domain/image.js";
import { createSharpImagePipeline } from "../../src/infrastructure/image/sharp-image-pipeline.js";

const pipelineConfig = Object.freeze({
  jpegQuality: 85,
  maxImageBytes: 10 * 1_024 * 1_024,
  maxImageDimension: 12_000,
  maxImagePixels: 40_000_000,
  maxTransmitBytes: 2 * 1_024 * 1_024,
  transmitMaxDimension: 2_048,
});

function authorized(bytes: Uint8Array): AuthorizedImage {
  return Object.freeze({ bytes, originalBytes: bytes.byteLength });
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("sharp image pipeline", () => {
  it("uses content signatures and supports PNG, JPEG, and WebP independent of filenames (IMG-03)", async () => {
    const pipeline = createSharpImagePipeline(pipelineConfig);
    const sources = await Promise.all([
      sharp({ create: { background: "red", channels: 3, height: 8, width: 8 } })
        .png()
        .toBuffer(),
      sharp({ create: { background: "green", channels: 3, height: 8, width: 8 } })
        .jpeg()
        .toBuffer(),
      sharp({ create: { background: "blue", channels: 3, height: 8, width: 8 } })
        .webp()
        .toBuffer(),
    ]);

    for (const source of sources) {
      const result = await pipeline.prepare(authorized(source), signal());
      expect(result).toMatchObject({ ok: true, value: { mimeType: "image/jpeg" } });
    }
  });

  it("rejects unsupported signatures before invoking the native decoder (IMG-03/IMG-04)", async () => {
    const pipeline = createSharpImagePipeline(pipelineConfig);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const gif = Buffer.from("GIF89a", "ascii");

    await expect(pipeline.prepare(authorized(svg), signal())).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA" },
      ok: false,
    });
    await expect(pipeline.prepare(authorized(gif), signal())).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA" },
      ok: false,
    });
  });

  it("returns a sanitized decode error for malformed supported input (IMG-03/IMG-04)", async () => {
    const pipeline = createSharpImagePipeline(pipelineConfig);
    const malformedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);

    const result = await pipeline.prepare(authorized(malformedJpeg), signal());

    expect(result).toMatchObject({ error: { code: "IMAGE_DECODE_FAILED" }, ok: false });
    expect(JSON.stringify(result)).not.toContain("Vips");
  });

  it("rejects declared dimensions above the limit before decode (IMG-02)", async () => {
    const pngHeader = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngHeader, 0);
    Buffer.from("IHDR").copy(pngHeader, 12);
    pngHeader.writeUInt32BE(12_001, 16);
    pngHeader.writeUInt32BE(10, 20);
    const pipeline = createSharpImagePipeline(pipelineConfig);

    await expect(pipeline.prepare(authorized(pngHeader), signal())).resolves.toMatchObject({
      error: { code: "IMAGE_TOO_LARGE" },
      ok: false,
    });
  });

  it("rejects a declared pixel count above the limit before decode (IMG-02)", async () => {
    const pngHeader = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngHeader, 0);
    Buffer.from("IHDR").copy(pngHeader, 12);
    pngHeader.writeUInt32BE(10_000, 16);
    pngHeader.writeUInt32BE(5_000, 20);
    const pipeline = createSharpImagePipeline(pipelineConfig);

    await expect(pipeline.prepare(authorized(pngHeader), signal())).resolves.toMatchObject({
      error: { code: "IMAGE_TOO_LARGE" },
      ok: false,
    });
  });

  it("re-encodes opaque images as JPEG and alpha images as PNG without enlargement (IMG-02)", async () => {
    const opaque = await sharp({
      create: { background: "#123456", channels: 3, height: 20, width: 40 },
    })
      .png()
      .toBuffer();
    const transparent = await sharp({
      create: {
        background: { alpha: 0.5, b: 30, g: 20, r: 10 },
        channels: 4,
        height: 20,
        width: 40,
      },
    })
      .png()
      .toBuffer();
    const pipeline = createSharpImagePipeline(pipelineConfig);

    const opaqueResult = await pipeline.prepare(authorized(opaque), signal());
    const transparentResult = await pipeline.prepare(authorized(transparent), signal());

    expect(opaqueResult).toMatchObject({
      ok: true,
      value: { height: 20, mimeType: "image/jpeg", transformed: true, width: 40 },
    });
    expect(transparentResult).toMatchObject({
      ok: true,
      value: { height: 20, mimeType: "image/png", transformed: true, width: 40 },
    });
  });

  it("applies EXIF orientation and strips source metadata (IMG-05/PRIV-02)", async () => {
    const source = await sharp({
      create: { background: "orange", channels: 3, height: 20, width: 40 },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Copyright: "private-canary" } })
      .toBuffer();
    const sourceMetadata = await sharp(source).metadata();
    expect(sourceMetadata.exif).toBeDefined();
    const pipeline = createSharpImagePipeline(pipelineConfig);

    const result = await pipeline.prepare(authorized(source), signal());
    if (!result.ok) {
      throw new Error(`Unexpected pipeline failure: ${result.error.code}`);
    }
    const outputMetadata = await sharp(result.value.bytes).metadata();

    expect(result.value).toMatchObject({ height: 40, width: 20 });
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputMetadata.icc).toBeUndefined();
    expect(outputMetadata.iptc).toBeUndefined();
    expect(outputMetadata.orientation).toBeUndefined();
    expect(outputMetadata.xmp).toBeUndefined();
    expect(Buffer.from(result.value.bytes).includes(Buffer.from("private-canary"))).toBe(false);
  });

  it("reduces quality and dimensions until the transmission cap is satisfied (IMG-02)", async () => {
    const width = 512;
    const height = 512;
    const pixels = Buffer.alloc(width * height * 3);
    for (let index = 0; index < pixels.byteLength; index += 1) {
      pixels[index] = (index * 73 + Math.floor(index / 97)) % 256;
    }
    const source = await sharp(pixels, { raw: { channels: 3, height, width } })
      .png()
      .toBuffer();
    const maximumBytes = 20_000;
    const pipeline = createSharpImagePipeline({
      ...pipelineConfig,
      maxTransmitBytes: maximumBytes,
    });

    const result = await pipeline.prepare(authorized(source), signal());
    if (!result.ok) {
      throw new Error(`Unexpected pipeline failure: ${result.error.code}`);
    }

    expect(result.value.bytes.byteLength).toBeLessThanOrEqual(maximumBytes);
    expect(result.value.width).toBeLessThan(width);
  });

  it("fails closed when even the smallest output cannot meet the cap", async () => {
    const source = await sharp({
      create: { background: "red", channels: 3, height: 8, width: 8 },
    })
      .png()
      .toBuffer();
    const pipeline = createSharpImagePipeline({ ...pipelineConfig, maxTransmitBytes: 1 });

    await expect(pipeline.prepare(authorized(source), signal())).resolves.toMatchObject({
      error: { code: "IMAGE_TOO_LARGE" },
      ok: false,
    });
  });

  it("honors a pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const pipeline = createSharpImagePipeline(pipelineConfig);

    await expect(
      pipeline.prepare(authorized(Buffer.from([0xff, 0xd8, 0xff])), controller.signal),
    ).resolves.toMatchObject({ error: { code: "CANCELLED" }, ok: false });
  });
});
