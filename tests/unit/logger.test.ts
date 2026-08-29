import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/logger.js";

function createDestination(chunks: string[]): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
}

describe("createLogger", () => {
  it("writes structured records at or above the configured level", () => {
    const chunks: string[] = [];
    const logger = createLogger("info", {
      clock: () => new Date("2026-08-28T00:00:00.000Z"),
      destination: createDestination(chunks),
    });

    logger.debug("hidden");
    logger.info("ready", { server: "sight-mcp" });

    expect(chunks).toEqual([
      '{"timestamp":"2026-08-28T00:00:00.000Z","level":"info","message":"ready","context":{"server":"sight-mcp"}}\n',
    ]);
  });

  it("writes nothing when logging is disabled", () => {
    const chunks: string[] = [];
    const logger = createLogger("silent", { destination: createDestination(chunks) });

    logger.error("hidden");

    expect(chunks).toEqual([]);
  });
});
