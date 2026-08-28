import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../../src/server/create-server.js";
import { SERVER_NAME, VERSION } from "../../src/version.js";

const closeCallbacks: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.allSettled(closeCallbacks.splice(0).map((close) => close()));
});

describe("Sight MCP server contract", () => {
  it("identifies itself and exposes a deterministic empty tool list", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: "sight-mcp-contract-test", version: "0.0.0" });
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    expect(client.getServerVersion()).toEqual({ name: SERVER_NAME, version: VERSION });
    await expect(client.listTools()).resolves.toEqual({ tools: [] });
  });
});
