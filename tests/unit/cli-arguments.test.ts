import { describe, expect, it } from "vitest";

import { CliUsageError, parseCliArguments } from "../../src/cli-arguments.js";

describe("parseCliArguments", () => {
  it("keeps no-argument stdio startup compatible", () => {
    expect(parseCliArguments([])).toEqual({ kind: "serve" });
  });

  it("parses credential management commands with arbitrary account names", () => {
    expect(parseCliArguments(["credentials", "set", "my-provider"])).toEqual({
      account: "my-provider",
      action: "set",
      kind: "credentials",
    });
    expect(parseCliArguments(["credentials", "status", "team.qwen_prod"])).toEqual({
      account: "team.qwen_prod",
      action: "status",
      kind: "credentials",
    });
    expect(parseCliArguments(["credentials", "delete", "provider@work", "--yes"])).toEqual({
      account: "provider@work",
      action: "delete",
      assumeYes: true,
      kind: "credentials",
    });
    expect(parseCliArguments(["credentials", "delete", "my-provider"])).toEqual({
      account: "my-provider",
      action: "delete",
      assumeYes: false,
      kind: "credentials",
    });
  });

  it("fails the removed --provider flag with a migration message", () => {
    let received: unknown;
    try {
      parseCliArguments(["--provider", "qwen"]);
    } catch (error: unknown) {
      received = error;
    }
    expect(received).toBeInstanceOf(CliUsageError);
    expect(String(received)).toContain("--provider");
    expect(String(received)).toContain("SIGHT_PROVIDER_BASE_URL");
    expect(String(received)).toContain("SIGHT_PROVIDER_MODEL");
  });

  it.each([
    ["--provider"],
    ["--unknown"],
    ["credentials"],
    ["credentials", "set"],
    ["credentials", "status"],
    ["credentials", "delete", "my-provider", "--force"],
    ["credentials", "status", "my-provider", "extra"],
    ["credentials", "set", "private invalid account"],
    ["credentials", "set", "-leading-dash"],
    ["credentials", "set", `a${"b".repeat(64)}`],
  ])("rejects invalid arguments without echoing them: %s", (...argumentsValue) => {
    let received: unknown;
    try {
      parseCliArguments(argumentsValue);
    } catch (error: unknown) {
      received = error;
    }
    expect(received).toBeInstanceOf(CliUsageError);
    expect(String(received)).not.toContain("private invalid account");
    expect(String(received)).not.toContain("-leading-dash");
  });
});
