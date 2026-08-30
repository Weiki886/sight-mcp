import { describe, expect, it } from "vitest";

import { retryDelayMilliseconds } from "../../src/infrastructure/provider/retry-policy.js";

describe("provider retry policy", () => {
  it("uses bounded exponential jitter", () => {
    expect(retryDelayMilliseconds(0, null, 0, 0)).toBe(125);
    expect(retryDelayMilliseconds(1, null, 0, 0.5)).toBe(500);
    expect(retryDelayMilliseconds(20, null, 0, 1)).toBe(5_000);
  });

  it("honors bounded delta-seconds and HTTP-date Retry-After values", () => {
    expect(retryDelayMilliseconds(0, "2", 0, 0)).toBe(2_000);
    expect(retryDelayMilliseconds(0, "Thu, 01 Jan 1970 00:00:04 GMT", 1_000, 0)).toBe(3_000);
  });

  it("falls back to local jitter for invalid or excessive Retry-After values", () => {
    expect(retryDelayMilliseconds(0, "31", 0, 0)).toBe(125);
    expect(retryDelayMilliseconds(0, "private-invalid-date", 0, 0)).toBe(125);
  });
});
