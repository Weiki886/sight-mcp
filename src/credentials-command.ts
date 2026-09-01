import { createInterface } from "node:readline/promises";

import type { CliCommand } from "./cli-arguments.js";
import type { CredentialStore } from "./credentials/credential-store.js";
import { providerProfileNames, type ProviderProfileName } from "./provider-profiles.js";

type CredentialsCommand = Extract<CliCommand, { kind: "credentials" }>;

export interface CredentialsCommandIO {
  readonly confirmDelete?: (provider: ProviderProfileName) => Promise<boolean>;
  readonly writeError?: (message: string) => void;
  readonly writeOutput?: (message: string) => void;
}

async function defaultConfirmDelete(provider: ProviderProfileName): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    return false;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await terminal.question(
      `Delete the ${provider} credential from macOS Keychain? [y/N] `,
    );
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    terminal.close();
  }
}

export async function runCredentialsCommand(
  command: CredentialsCommand,
  store: CredentialStore,
  io: CredentialsCommandIO = {},
): Promise<number> {
  const writeOutput = io.writeOutput ?? ((message) => process.stdout.write(`${message}\n`));
  const writeError = io.writeError ?? ((message) => process.stderr.write(`${message}\n`));
  const confirmDelete = io.confirmDelete ?? defaultConfirmDelete;

  if (command.action === "set") {
    await store.setInteractively(command.provider);
    writeOutput(`${command.provider}: configured`);
    return 0;
  }

  if (command.action === "status") {
    const providers = command.provider === undefined ? providerProfileNames : [command.provider];
    for (const provider of providers) {
      writeOutput(`${provider}: ${(await store.has(provider)) ? "configured" : "missing"}`);
    }
    return 0;
  }

  if (!command.assumeYes && !(await confirmDelete(command.provider))) {
    writeError("Credential deletion cancelled. Use --yes for explicit non-interactive deletion.");
    return 1;
  }
  const deleted = await store.delete(command.provider);
  writeOutput(`${command.provider}: ${deleted ? "deleted" : "missing"}`);
  return 0;
}
