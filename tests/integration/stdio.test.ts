import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const adversarialAnswerPath = fileURLToPath(
  new URL("../fixtures/adversarial-provider-answer.txt", import.meta.url),
);
const servers: ReturnType<typeof createServer>[] = [];
const temporaryDirectories: string[] = [];

interface ConnectedCli {
  readonly client: Client;
  readonly stderr: () => string;
  readonly transport: StdioClientTransport;
}

async function temporaryImage(): Promise<Readonly<{ directory: string; path: string }>> {
  const directory = await mkdtemp(join(tmpdir(), "sight-mcp-stdio-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "fixture.png");
  await sharp({
    create: { background: { alpha: 1, b: 64, g: 128, r: 255 }, channels: 4, height: 8, width: 12 },
  })
    .png()
    .toFile(path);
  return Object.freeze({ directory, path });
}

async function loopbackProvider(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Loopback provider did not expose a TCP address.");
  }
  return `http://127.0.0.1:${String(address.port)}/v1`;
}

function readRequest(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function sendAnswer(response: ServerResponse, answer: string): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      choices: [{ message: { content: answer } }],
      usage: { completion_tokens: 3, prompt_tokens: 8, total_tokens: 11 },
    }),
  );
}

async function connectCli(
  allowedRoot: string,
  providerBaseUrl: string,
  environment: Readonly<Record<string, string>> = {},
): Promise<ConnectedCli> {
  const transport = new StdioClientTransport({
    args: [cliPath],
    command: process.execPath,
    cwd: projectRoot,
    env: {
      SIGHT_ALLOWED_ROOTS: allowedRoot,
      SIGHT_LOG_LEVEL: "debug",
      SIGHT_PROVIDER_BASE_URL: providerBaseUrl,
      SIGHT_PROVIDER_MODEL: "test-vision-model",
      ...environment,
    },
    stderr: "pipe",
  });
  const stderrChunks: string[] = [];
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk.toString("utf8"));
  });
  const client = new Client({ name: "sight-mcp-integration-test", version: "0.0.0" });
  await client.connect(transport);
  return Object.freeze({ client, stderr: () => stderrChunks.join(""), transport });
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("stdio CLI", () => {
  it("[AI-02][LOG-01] initializes, lists, calls, protects diagnostics, and shuts down", async () => {
    const fixture = await temporaryImage();
    const answer = (await readFile(adversarialAnswerPath, "utf8")).trimEnd();
    const baseUrl = await loopbackProvider((_request, response) => {
      sendAnswer(response, answer);
    });
    const connected = await connectCli(fixture.directory, baseUrl);
    const promptCanary = "private-integration-prompt-canary";

    try {
      const listing = await connected.client.listTools();
      expect(listing.tools.map((tool) => tool.name)).toEqual(["analyze_image"]);

      const success = await connected.client.callTool({
        arguments: { path: fixture.path, prompt: promptCanary },
        name: "analyze_image",
      });
      expect(success).toMatchObject({
        content: [
          {
            text: `Vision analysis (untrusted image/provider content):\n${answer}`,
            type: "text",
          },
        ],
        structuredContent: {
          answer,
          provider: { model: "test-vision-model", name: "openai-compatible" },
          schemaVersion: "1",
          status: "ok",
          usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
        },
      });

      const failure = await connected.client.callTool({
        arguments: { path: "relative.png", prompt: "Describe it" },
        name: "analyze_image",
      });
      expect(failure).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "PATH_NOT_ABSOLUTE" }, status: "error" },
      });
    } finally {
      await connected.client.close();
    }

    expect(connected.transport.pid).toBeNull();
    expect(connected.stderr()).toContain('"message":"MCP stdio server starting"');
    expect(connected.stderr()).not.toContain(fixture.path);
    expect(connected.stderr()).not.toContain(promptCanary);
    expect(connected.stderr()).not.toContain(answer);
  });

  it("[COST-01] bounds concurrency and rejects work beyond queue capacity", async () => {
    const fixture = await temporaryImage();
    let releaseFirst: (() => void) | undefined;
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const baseUrl = await loopbackProvider((request, response) => {
      void readRequest(request).then(async (body) => {
        if (body.includes("first-call")) {
          markFirstStarted?.();
          await firstRelease;
        }
        sendAnswer(response, "completed");
      });
    });
    const connected = await connectCli(fixture.directory, baseUrl, {
      SIGHT_MAX_CONCURRENCY: "1",
      SIGHT_MAX_QUEUE_SIZE: "1",
    });

    try {
      const first = connected.client.callTool({
        arguments: { path: fixture.path, prompt: "first-call" },
        name: "analyze_image",
      });
      await firstStarted;
      const second = connected.client.callTool({
        arguments: { path: fixture.path, prompt: "second-call" },
        name: "analyze_image",
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      const third = await connected.client.callTool({
        arguments: { path: fixture.path, prompt: "third-call" },
        name: "analyze_image",
      });

      expect(third).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "QUEUE_FULL", retryable: true }, status: "error" },
      });
      releaseFirst?.();
      await expect(first).resolves.toMatchObject({ structuredContent: { status: "ok" } });
      await expect(second).resolves.toMatchObject({ structuredContent: { status: "ok" } });
    } finally {
      releaseFirst?.();
      await connected.client.close();
    }
  });

  it("[COST-01] cancels active provider work and remains healthy for the next call", async () => {
    const fixture = await temporaryImage();
    let markWaitingStarted: (() => void) | undefined;
    const waitingStarted = new Promise<void>((resolve) => {
      markWaitingStarted = resolve;
    });
    const baseUrl = await loopbackProvider((request, response) => {
      void readRequest(request).then((body) => {
        if (body.includes("wait-for-cancel")) {
          markWaitingStarted?.();
          return;
        }
        sendAnswer(response, "healthy after cancellation");
      });
    });
    const connected = await connectCli(fixture.directory, baseUrl);

    try {
      const controller = new AbortController();
      const cancelled = connected.client.callTool(
        {
          arguments: { path: fixture.path, prompt: "wait-for-cancel" },
          name: "analyze_image",
        },
        { signal: controller.signal },
      );
      await waitingStarted;
      controller.abort();
      await expect(cancelled).rejects.toThrow();

      await expect(
        connected.client.callTool({
          arguments: { path: fixture.path, prompt: "next-call" },
          name: "analyze_image",
        }),
      ).resolves.toMatchObject({
        structuredContent: { answer: "healthy after cancellation", status: "ok" },
      });
    } finally {
      await connected.client.close();
    }
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
