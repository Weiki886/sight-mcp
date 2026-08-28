import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";

import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { SERVER_NAME, VERSION } from "../version.js";
import { createServer } from "./create-server.js";

export function startStdioServer(config: AppConfig, logger: Logger): StdioServerHandle {
  logger.info("MCP stdio server starting", {
    logLevel: config.logLevel,
    server: SERVER_NAME,
    version: VERSION,
  });

  return serveStdio(createServer, {
    onerror: (error) => {
      logger.error("MCP transport error", { errorName: error.name });
    },
  });
}
