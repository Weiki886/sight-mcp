import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";

import {
  createAnalyzeClipboardImageService,
  createAnalyzeImageService,
} from "../application/analyze-image.js";
import { createBoundedWorkQueue } from "../application/bounded-work-queue.js";
import type { AppConfig } from "../config.js";
import { createMacOSClipboardImageReader } from "../infrastructure/clipboard/macos-clipboard-image-reader.js";
import { createNodeInputGuard } from "../infrastructure/filesystem/node-input-guard.js";
import { createSharpImagePipeline } from "../infrastructure/image/sharp-image-pipeline.js";
import { createMacOSPathAccessAuthorizer } from "../infrastructure/macos/path-access-authorizer.js";
import { createOpenAICompatibleProvider } from "../infrastructure/provider/openai-compatible-provider.js";
import type { Logger } from "../logger.js";
import { SERVER_NAME, VERSION } from "../version.js";
import { createServer } from "./create-server.js";

export function startStdioServer(config: AppConfig, logger: Logger): StdioServerHandle {
  for (const warning of config.warnings) {
    logger.warn("Sight MCP is configured with a broad allowed root", { warning });
  }

  logger.info("MCP stdio server starting", {
    logLevel: config.logLevel,
    server: SERVER_NAME,
    version: VERSION,
  });

  const inputGuard = createNodeInputGuard(
    config.image,
    process.platform === "darwin" ? createMacOSPathAccessAuthorizer() : undefined,
  );
  const pipeline = createSharpImagePipeline(config.image);
  const provider = createOpenAICompatibleProvider(config.provider, { logger });
  const queue = createBoundedWorkQueue(
    config.execution.maxConcurrency,
    config.execution.maxQueueSize,
  );
  const analyzeImage = createAnalyzeImageService(
    { inputGuard, logger, pipeline, provider, queue },
    config.provider,
  );
  const clipboardReader = createMacOSClipboardImageReader({
    maxImageBytes: config.image.maxImageBytes,
  });
  const analyzeClipboardImage = createAnalyzeClipboardImageService(
    { clipboardReader, logger, pipeline, provider, queue },
    config.provider,
  );

  return serveStdio(() => createServer({ analyzeClipboardImage, analyzeImage }), {
    onerror: (error) => {
      logger.error("MCP transport error", { errorName: error.name });
    },
  });
}
