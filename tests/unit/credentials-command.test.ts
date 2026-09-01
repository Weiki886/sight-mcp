import { describe, expect, it, vi } from "vitest";

import type { CredentialStore } from "../../src/credentials/credential-store.js";
import { runCredentialsCommand } from "../../src/credentials-command.js";

function credentialStore(overrides: Partial<CredentialStore> = {}): CredentialStore {
  return {
    delete: vi.fn(() => Promise.resolve(true)),
    get: vi.fn(() => Promise.resolve(undefined)),
    has: vi.fn(() => Promise.resolve(false)),
    setInteractively: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("credentials command", () => {
  it("sets a selected credential without receiving its value", async () => {
    const store = credentialStore();
    const output: string[] = [];
    await expect(
      runCredentialsCommand({ action: "set", kind: "credentials", provider: "qwen" }, store, {
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBe(0);
    expect(store.setInteractively).toHaveBeenCalledWith("qwen");
    expect(output).toEqual(["qwen: configured"]);
  });

  it("reports status for both profiles without reading either secret", async () => {
    const store = credentialStore({
      has: vi.fn((provider) => Promise.resolve(provider === "qwen")),
    });
    const output: string[] = [];
    await runCredentialsCommand({ action: "status", kind: "credentials" }, store, {
      writeOutput: (message) => output.push(message),
    });
    expect(output).toEqual(["qwen: configured", "deepseek: missing"]);
    expect(store.get).not.toHaveBeenCalled();
  });

  it("does not delete without confirmation", async () => {
    const store = credentialStore();
    const errors: string[] = [];
    await expect(
      runCredentialsCommand(
        { action: "delete", assumeYes: false, kind: "credentials", provider: "deepseek" },
        store,
        {
          confirmDelete: () => Promise.resolve(false),
          writeError: (message) => errors.push(message),
        },
      ),
    ).resolves.toBe(1);
    expect(store.delete).not.toHaveBeenCalled();
    expect(errors).toEqual([
      "Credential deletion cancelled. Use --yes for explicit non-interactive deletion.",
    ]);
  });

  it("deletes only the selected account after explicit confirmation", async () => {
    const store = credentialStore();
    const output: string[] = [];
    await expect(
      runCredentialsCommand(
        { action: "delete", assumeYes: true, kind: "credentials", provider: "qwen" },
        store,
        { writeOutput: (message) => output.push(message) },
      ),
    ).resolves.toBe(0);
    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenCalledWith("qwen");
    expect(output).toEqual(["qwen: deleted"]);
  });
});
