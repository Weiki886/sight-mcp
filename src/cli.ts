#!/usr/bin/env node

import type { StdioServerHandle } from "@modelcontextprotocol/server/stdio";

import { parseCliArguments, CliUsageError } from "./cli-arguments.js";
import { ConfigError, loadConfig } from "./config.js";
import { CredentialStoreError } from "./credentials/credential-store.js";
import { runCredentialsCommand } from "./credentials-command.js";
import { createMacOSKeychainStore } from "./infrastructure/credentials/macos-keychain-store.js";
import { createLogger, type Logger } from "./logger.js";
import { startStdioServer } from "./server/run-stdio.js";

function writeStartupError(error: unknown): void {
  const message =
    error instanceof ConfigError ||
    error instanceof CredentialStoreError ||
    error instanceof CliUsageError
      ? error.message
      : "Sight MCP failed to start because of an unexpected error.";

  process.stderr.write(`${message}\n`);
}

function registerShutdown(handle: StdioServerHandle, logger: Logger): void {
  let isClosing = false;

  const close = (signal: "SIGINT" | "SIGTERM") => {
    if (isClosing) {
      return;
    }
    isClosing = true;
    logger.info("MCP stdio server stopping", { signal });
    void handle.close().catch((error: unknown) => {
      logger.error("MCP stdio server shutdown failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", () => {
    close("SIGINT");
  });
  process.once("SIGTERM", () => {
    close("SIGTERM");
  });
}

async function main(): Promise<void> {
  const command = parseCliArguments(process.argv.slice(2));
  const credentialStore = createMacOSKeychainStore();
  if (command.kind === "credentials") {
    process.exitCode = await runCredentialsCommand(command, credentialStore);
    return;
  }

  const config = await loadConfig(process.env, {
    credentialReader: credentialStore,
    ...(command.provider === undefined ? {} : { providerProfile: command.provider }),
  });
  const logger = createLogger(config.logLevel);
  const handle = startStdioServer(config, logger);
  registerShutdown(handle, logger);
}

try {
  await main();
} catch (error: unknown) {
  writeStartupError(error);
  process.exitCode = error instanceof CliUsageError ? 2 : 1;
}
