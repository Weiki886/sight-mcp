import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("uses a safe default", () => {
    expect(loadConfig({})).toEqual({ logLevel: "info" });
  });

  it("returns an immutable typed configuration", () => {
    expect(Object.isFrozen(loadConfig({ SIGHT_LOG_LEVEL: "debug" }))).toBe(true);
  });

  it("rejects invalid log levels without echoing their value", () => {
    const secretValue = "secret-value-that-must-not-be-logged";

    expect(() => loadConfig({ SIGHT_LOG_LEVEL: secretValue })).toThrow(ConfigError);
    expect(() => loadConfig({ SIGHT_LOG_LEVEL: secretValue })).toThrow(
      "SIGHT_LOG_LEVEL must be one of",
    );

    try {
      loadConfig({ SIGHT_LOG_LEVEL: secretValue });
    } catch (error: unknown) {
      expect(String(error)).not.toContain(secretValue);
    }
  });
});
