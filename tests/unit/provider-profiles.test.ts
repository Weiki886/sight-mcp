import { describe, expect, it } from "vitest";

import {
  isProviderProfileName,
  providerProfile,
  providerProfileNames,
} from "../../src/provider-profiles.js";

describe("provider profiles", () => {
  it("publishes exactly the reviewed immutable profiles", () => {
    expect(providerProfileNames).toEqual(["qwen", "deepseek"]);
    expect(providerProfile("qwen")).toEqual({
      apiKeyEnvironmentVariable: "SIGHT_QWEN_API_KEY",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      keychainAccount: "qwen",
      model: "qwen3.8-flash",
      name: "qwen",
      reasoningEffort: "low",
    });
    expect(providerProfile("deepseek")).toEqual({
      apiKeyEnvironmentVariable: "SIGHT_DEEPSEEK_API_KEY",
      baseUrl: "https://api.deepseek.com",
      keychainAccount: "deepseek",
      model: "deepseek-v4-flash-vision-exp",
      name: "deepseek",
      reasoningEffort: "low",
    });
    expect(Object.isFrozen(providerProfile("qwen"))).toBe(true);
    expect(Object.isFrozen(providerProfile("deepseek"))).toBe(true);
  });

  it("narrows only known profile names", () => {
    expect(isProviderProfileName("qwen")).toBe(true);
    expect(isProviderProfileName("deepseek")).toBe(true);
    expect(isProviderProfileName("other")).toBe(false);
  });
});
