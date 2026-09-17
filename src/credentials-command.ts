import { createInterface } from "node:readline/promises";

import type { CliCommand } from "./cli-arguments.js";
import type { CredentialStore } from "./credentials/credential-store.js";

type CredentialsCommand = Extract<CliCommand, { kind: "credentials" }>;

export interface CredentialsCommandIO {
  readonly confirmDelete?: (account: string) => Promise<boolean>;
  readonly writeError?: (message: string) => void;
  readonly writeOutput?: (message: string) => void;
}

async function defaultConfirmDelete(account: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    return false;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await terminal.question(
      `Delete the ${account} credential from macOS Keychain? [y/N] `,
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
    await store.setInteractively(command.account);
    writeOutput(`${command.account}: configured`);
    return 0;
  }

  if (command.action === "status") {
    writeOutput(
      `${command.account}: ${(await store.has(command.account)) ? "configured" : "missing"}`,
    );
    return 0;
  }

  if (!command.assumeYes && !(await confirmDelete(command.account))) {
    writeError("Credential deletion cancelled. Use --yes for explicit non-interactive deletion.");
    return 1;
  }
  const deleted = await store.delete(command.account);
  writeOutput(`${command.account}: ${deleted ? "deleted" : "missing"}`);
  return 0;
}
