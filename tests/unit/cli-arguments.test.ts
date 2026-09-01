import { describe, expect, it } from "vitest";

import { CliUsageError, parseCliArguments } from "../../src/cli-arguments.js";

describe("parseCliArguments", () => {
  it("keeps no-argument stdio startup compatible", () => {
    expect(parseCliArguments([])).toEqual({ kind: "serve" });
  });

  it.each(["qwen", "deepseek"] as const)("selects provider profile %s", (provider) => {
    expect(parseCliArguments(["--provider", provider])).toEqual({ kind: "serve", provider });
  });

  it("parses credential management commands", () => {
    expect(parseCliArguments(["credentials", "set", "qwen"])).toEqual({
      action: "set",
      kind: "credentials",
      provider: "qwen",
    });
    expect(parseCliArguments(["credentials", "status"])).toEqual({
      action: "status",
      kind: "credentials",
    });
    expect(parseCliArguments(["credentials", "status", "deepseek"])).toEqual({
      action: "status",
      kind: "credentials",
      provider: "deepseek",
    });
    expect(parseCliArguments(["credentials", "delete", "qwen", "--yes"])).toEqual({
      action: "delete",
      assumeYes: true,
      kind: "credentials",
      provider: "qwen",
    });
  });

  it.each([
    ["--provider"],
    ["--provider", "private-invalid-provider"],
    ["--provider", "qwen", "extra"],
    ["credentials"],
    ["credentials", "set"],
    ["credentials", "set", "invalid"],
    ["credentials", "delete", "qwen", "--force"],
    ["credentials", "status", "qwen", "extra"],
  ])("rejects invalid arguments without echoing them: %s", (...argumentsValue) => {
    let received: unknown;
    try {
      parseCliArguments(argumentsValue);
    } catch (error: unknown) {
      received = error;
    }
    expect(received).toBeInstanceOf(CliUsageError);
    expect(String(received)).not.toContain("private-invalid-provider");
  });
});
