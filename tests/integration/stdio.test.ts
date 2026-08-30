import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

describe("stdio CLI", () => {
  it("starts, serves an empty tool list, keeps diagnostics off stdout, and shuts down", async () => {
    const transport = new StdioClientTransport({
      args: [cliPath],
      command: process.execPath,
      cwd: projectRoot,
      env: {
        SIGHT_LOG_LEVEL: "info",
        SIGHT_PROVIDER_BASE_URL: "http://127.0.0.1:11434/v1",
        SIGHT_PROVIDER_MODEL: "test-vision-model",
      },
      stderr: "pipe",
    });
    const stderrChunks: string[] = [];
    transport.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
    });
    const client = new Client({ name: "sight-mcp-integration-test", version: "0.0.0" });

    try {
      await client.connect(transport);
      await expect(client.listTools()).resolves.toEqual({ tools: [] });
    } finally {
      await client.close();
    }

    expect(transport.pid).toBeNull();
    expect(stderrChunks.join("")).toContain('"message":"MCP stdio server starting"');
  });

  it("fails closed on invalid configuration without writing to stdout", async () => {
    const child = spawn(process.execPath, [cliPath], {
      cwd: projectRoot,
      env: {
        PATH: process.env["PATH"],
        SIGHT_LOG_LEVEL: "invalid-secret-value",
        SIGHT_PROVIDER_BASE_URL: "http://127.0.0.1:11434/v1",
        SIGHT_PROVIDER_MODEL: "test-vision-model",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const [exitCode] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("SIGHT_LOG_LEVEL is invalid.");
    expect(stderr).not.toContain("invalid-secret-value");
  });
});
