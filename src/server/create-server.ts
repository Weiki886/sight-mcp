import { McpServer } from "@modelcontextprotocol/server";

import { SERVER_NAME, VERSION } from "../version.js";

export function createServer(): McpServer {
  return new McpServer(
    {
      name: SERVER_NAME,
      version: VERSION,
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      instructions: "Sight MCP is running in scaffold mode. Image analysis is not available yet.",
    },
  );
}
