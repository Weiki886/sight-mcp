import { describe, expect, it, vi } from "vitest";

import { CredentialStoreError } from "../../src/credentials/credential-store.js";
import {
  createMacOSKeychainStore,
  keychainService,
  type SecurityCommandRunner,
} from "../../src/infrastructure/credentials/macos-keychain-store.js";

function runner(exitCode = 0, stdout = ""): SecurityCommandRunner {
  return vi.fn(() => Promise.resolve({ exitCode, stdout: new TextEncoder().encode(stdout) }));
}

describe("macOS Keychain credential store", () => {
  it("reads only the exact service/account and removes one trailing newline", async () => {
    const run = runner(0, "private-key-canary\n");
    const store = createMacOSKeychainStore({ platform: "darwin", run });

    await expect(store.get("qwen")).resolves.toBe("private-key-canary");
    expect(run).toHaveBeenCalledWith(
      ["find-generic-password", "-a", "qwen", "-s", keychainService, "-w"],
      { captureStdout: true, inheritStdio: false },
    );
  });

  it("supports an isolated service only through the construction seam", async () => {
    const run = runner();
    const service = "dev.weiki886.sight-mcp.test.canary";
    const store = createMacOSKeychainStore({ platform: "darwin", run, service });

    await store.has("qwen");
    expect(run).toHaveBeenCalledWith(["find-generic-password", "-a", "qwen", "-s", service], {
      captureStdout: false,
      inheritStdio: false,
    });
  });

  it("checks existence without requesting password output", async () => {
    const run = runner();
    const store = createMacOSKeychainStore({ platform: "darwin", run });

    await expect(store.has("deepseek")).resolves.toBe(true);
    expect(run).toHaveBeenCalledWith(
      ["find-generic-password", "-a", "deepseek", "-s", keychainService],
      { captureStdout: false, inheritStdio: false },
    );
  });

  it("passes no secret in argv when setting and leaves prompt flag last", async () => {
    const run = runner();
    const store = createMacOSKeychainStore({
      inputIsTTY: true,
      outputIsTTY: true,
      platform: "darwin",
      run,
    });

    await store.setInteractively("qwen");
    const argumentsValue = vi.mocked(run).mock.calls[0]?.[0];
    expect(argumentsValue?.at(-1)).toBe("-w");
    expect(argumentsValue).not.toContain("private-key-canary");
    expect(run).toHaveBeenCalledWith(expect.any(Array), {
      captureStdout: false,
      inheritStdio: true,
    });
  });

  it("requires a terminal before invoking the system prompt", async () => {
    const run = runner();
    const store = createMacOSKeychainStore({
      inputIsTTY: false,
      outputIsTTY: false,
      platform: "darwin",
      run,
    });

    await expect(store.setInteractively("qwen")).rejects.toMatchObject({
      code: "CREDENTIAL_INTERACTIVE_REQUIRED",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("maps missing items without exposing system diagnostics", async () => {
    const run = runner(44, "private-output-that-must-be-discarded");
    const store = createMacOSKeychainStore({ platform: "darwin", run });

    await expect(store.get("qwen")).resolves.toBeUndefined();
    await expect(store.has("qwen")).resolves.toBe(false);
    await expect(store.delete("qwen")).resolves.toBe(false);
  });

  it("fails closed on unsupported platforms and command failures", async () => {
    const unavailable = createMacOSKeychainStore({ platform: "linux", run: runner() });
    await expect(unavailable.get("qwen")).rejects.toBeInstanceOf(CredentialStoreError);
    await expect(unavailable.get("qwen")).rejects.toMatchObject({
      code: "CREDENTIAL_STORE_UNAVAILABLE",
    });

    const failed = createMacOSKeychainStore({ platform: "darwin", run: runner(1) });
    await expect(failed.get("qwen")).rejects.toMatchObject({
      code: "CREDENTIAL_COMMAND_FAILED",
    });
  });
});
