import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";

import {
  createAnalyzeClipboardImageService,
  createAnalyzeImageService,
} from "../application/analyze-image.js";
import { createBoundedWorkQueue } from "../application/bounded-work-queue.js";
import type { AppConfig } from "../config.js";
import { createMacOSClipboardImageReader } from "../infrastructure/clipboard/macos-clipboard-image-reader.js";
import { createNodeInputGuard } from "../infrastructure/filesystem/node-input-guard.js";
import { createCachingOutsideRootAuthorizer } from "../infrastructure/filesystem/session-access-cache.js";
import { createSharpImagePipeline } from "../infrastructure/image/sharp-image-pipeline.js";
import { createMacOSPathAccessAuthorizer } from "../infrastructure/macos/path-access-authorizer.js";
import { createOpenAICompatibleProvider } from "../infrastructure/provider/openai-compatible-provider.js";
import type { Logger } from "../logger.js";
import { SERVER_NAME, VERSION } from "../version.js";
import { createServer } from "./create-server.js";
import { subscribeToClientRoots, type RootsSubscription } from "./roots-subscription.js";

export function startStdioServer(config: AppConfig, logger: Logger): StdioServerHandle {
  for (const warning of config.warnings) {
    logger.warn("Sight MCP is configured with a broad allowed root", { warning });
  }

  logger.info("MCP stdio server starting", {
    logLevel: config.logLevel,
    server: SERVER_NAME,
    version: VERSION,
  });

  // The roots subscription needs the server, and the server needs the guard,
  // so the guard reads the subscription through this slot once it exists.
  let rootsSubscription: RootsSubscription | undefined;
  const discoveredRoots = (): readonly string[] => rootsSubscription?.current() ?? [];

  const promptForAccess =
    process.platform === "darwin"
      ? createCachingOutsideRootAuthorizer({
          authorize: createMacOSPathAccessAuthorizer(),
          onGrant: (directory) => {
            logger.info("Directory authorized for this session", { directory });
          },
        })
      : undefined;
  const inputGuard = createNodeInputGuard(config.image, promptForAccess, discoveredRoots);
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

  return serveStdio(
    () => {
      const server = createServer({ analyzeClipboardImage, analyzeImage });
      rootsSubscription = subscribeToClientRoots(server, logger);
      return server;
    },
    {
      onerror: (error) => {
        logger.error("MCP transport error", { errorName: error.name });
      },
    },
  );
}
