export type SupportedImageFormat = "jpeg" | "png" | "webp";

export type MediaSignature = Readonly<{
  format: SupportedImageFormat;
  height?: number;
  width?: number;
}>;

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function unsigned16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function unsigned16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function unsigned24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function unsigned32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1_00_00_00 +
      (bytes[offset + 1] ?? 0) * 0x1_00_00 +
      (bytes[offset + 2] ?? 0) * 0x1_00 +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function pngSignature(bytes: Uint8Array): MediaSignature | undefined {
  if (
    bytes.byteLength < 24 ||
    !matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    !matches(bytes, 12, [0x49, 0x48, 0x44, 0x52])
  ) {
    return undefined;
  }

  return Object.freeze({
    format: "png",
    height: unsigned32BigEndian(bytes, 20),
    width: unsigned32BigEndian(bytes, 16),
  });
}

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegSignature(bytes: Uint8Array): MediaSignature | undefined {
  if (bytes.byteLength < 3 || !matches(bytes, 0, [0xff, 0xd8, 0xff])) {
    return undefined;
  }

  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      break;
    }
    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= bytes.byteLength) {
      break;
    }

    const segmentLength = unsigned16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      break;
    }
    if (jpegStartOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return Object.freeze({
        format: "jpeg",
        height: unsigned16BigEndian(bytes, offset + 3),
        width: unsigned16BigEndian(bytes, offset + 5),
      });
    }
    offset += segmentLength;
  }

  return Object.freeze({ format: "jpeg" });
}

function webpSignature(bytes: Uint8Array): MediaSignature | undefined {
  if (
    bytes.byteLength < 20 ||
    !matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) ||
    !matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return undefined;
  }

  if (matches(bytes, 12, [0x56, 0x50, 0x38, 0x58]) && bytes.byteLength >= 30) {
    return Object.freeze({
      format: "webp",
      height: unsigned24LittleEndian(bytes, 27) + 1,
      width: unsigned24LittleEndian(bytes, 24) + 1,
    });
  }

  if (
    matches(bytes, 12, [0x56, 0x50, 0x38, 0x4c]) &&
    bytes.byteLength >= 25 &&
    bytes[20] === 0x2f
  ) {
    const first = bytes[21] ?? 0;
    const second = bytes[22] ?? 0;
    const third = bytes[23] ?? 0;
    const fourth = bytes[24] ?? 0;
    return Object.freeze({
      format: "webp",
      height: 1 + (second >>> 6) + (third << 2) + ((fourth & 0x0f) << 10),
      width: 1 + first + ((second & 0x3f) << 8),
    });
  }

  if (
    matches(bytes, 12, [0x56, 0x50, 0x38, 0x20]) &&
    bytes.byteLength >= 30 &&
    matches(bytes, 23, [0x9d, 0x01, 0x2a])
  ) {
    return Object.freeze({
      format: "webp",
      height: unsigned16LittleEndian(bytes, 28) & 0x3fff,
      width: unsigned16LittleEndian(bytes, 26) & 0x3fff,
    });
  }

  return Object.freeze({ format: "webp" });
}

export function detectMediaSignature(bytes: Uint8Array): MediaSignature | undefined {
  return pngSignature(bytes) ?? jpegSignature(bytes) ?? webpSignature(bytes);
}
