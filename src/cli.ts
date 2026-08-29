#!/usr/bin/env node

import type { StdioServerHandle } from "@modelcontextprotocol/server/stdio";

import { ConfigError, loadConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { startStdioServer } from "./server/run-stdio.js";

function writeStartupError(error: unknown): void {
  const message =
    error instanceof ConfigError
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

try {
  const config = await loadConfig();
  const logger = createLogger(config.logLevel);
  const handle = startStdioServer(config, logger);
  registerShutdown(handle, logger);
} catch (error: unknown) {
  writeStartupError(error);
  process.exitCode = 1;
}
