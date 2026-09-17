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
  it("sets a named credential without receiving its value", async () => {
    const store = credentialStore();
    const output: string[] = [];
    await expect(
      runCredentialsCommand({ account: "my-provider", action: "set", kind: "credentials" }, store, {
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBe(0);
    expect(store.setInteractively).toHaveBeenCalledWith("my-provider");
    expect(output).toEqual(["my-provider: configured"]);
  });

  it("reports the named account status without reading its secret", async () => {
    const store = credentialStore({
      has: vi.fn((account) => Promise.resolve(account === "configured-account")),
    });
    const output: string[] = [];
    await runCredentialsCommand(
      { account: "configured-account", action: "status", kind: "credentials" },
      store,
      { writeOutput: (message) => output.push(message) },
    );
    await runCredentialsCommand(
      { account: "other-account", action: "status", kind: "credentials" },
      store,
      { writeOutput: (message) => output.push(message) },
    );
    expect(output).toEqual(["configured-account: configured", "other-account: missing"]);
    expect(store.get).not.toHaveBeenCalled();
  });

  it("does not delete without confirmation", async () => {
    const store = credentialStore();
    const errors: string[] = [];
    await expect(
      runCredentialsCommand(
        { account: "my-provider", action: "delete", assumeYes: false, kind: "credentials" },
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

  it("deletes only the named account after explicit confirmation", async () => {
    const store = credentialStore();
    const output: string[] = [];
    await expect(
      runCredentialsCommand(
        { account: "my-provider", action: "delete", assumeYes: true, kind: "credentials" },
        store,
        { writeOutput: (message) => output.push(message) },
      ),
    ).resolves.toBe(0);
    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenCalledWith("my-provider");
    expect(output).toEqual(["my-provider: deleted"]);
  });
});
