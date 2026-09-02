import { describe, expect, it, vi } from "vitest";

import type { OsascriptCommandRunner } from "../../src/infrastructure/macos/osascript.js";
import { createMacOSPathAccessAuthorizer } from "../../src/infrastructure/macos/path-access-authorizer.js";

function okResult(status: string) {
  return Object.freeze({
    aborted: false,
    exitCode: 0,
    stdout: new TextEncoder().encode(status),
  });
}

describe("macOS path access authorizer", () => {
  it("returns ALLOWED when the user confirms the dialog and passes the path as an argument", async () => {
    const run = vi.fn<OsascriptCommandRunner>(() => Promise.resolve(okResult("ALLOWED")));
    const authorizer = createMacOSPathAccessAuthorizer({ run });

    await expect(authorizer("/tmp/secret.png", new AbortController().signal)).resolves.toBe(
      "ALLOWED",
    );

    expect(run).toHaveBeenCalledOnce();
    const [argumentsValue, signal] = run.mock.calls[0] ?? [];
    expect(argumentsValue?.[0]).toBe("-e");
    expect(argumentsValue?.[2]).toBe("/tmp/secret.png");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it.each(["DENIED", "UNEXPECTED"] as const)(
    "returns DENIED for non-confirming stdout %s",
    async (status) => {
      const run = vi.fn<OsascriptCommandRunner>(() => Promise.resolve(okResult(status)));
      await expect(
        createMacOSPathAccessAuthorizer({ run })("/tmp/a.png", new AbortController().signal),
      ).resolves.toBe("DENIED");
    },
  );

  it("returns DENIED when the osascript command fails or is aborted", async () => {
    const failedRun = vi.fn<OsascriptCommandRunner>(() =>
      Promise.resolve({ aborted: false, exitCode: 1, stdout: new Uint8Array() }),
    );
    await expect(
      createMacOSPathAccessAuthorizer({ run: failedRun })(
        "/tmp/a.png",
        new AbortController().signal,
      ),
    ).resolves.toBe("DENIED");

    const abortedRun = vi.fn<OsascriptCommandRunner>(() =>
      Promise.resolve({ aborted: true, exitCode: null, stdout: new Uint8Array() }),
    );
    await expect(
      createMacOSPathAccessAuthorizer({ run: abortedRun })(
        "/tmp/a.png",
        new AbortController().signal,
      ),
    ).resolves.toBe("DENIED");
  });
});
