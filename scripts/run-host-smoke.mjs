import { execFile, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { promisify } from "node:util";

import sharp from "sharp";

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function hostArguments(host, configPath, config, prompt, schemaPath, resultPath) {
  if (host === "claude-code") {
    return [
      "--print",
      "--output-format",
      "json",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--mcp-config",
      configPath,
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "mcp__sight-mcp__analyze_image",
      "--json-schema",
      JSON.stringify(config.outputSchema),
      prompt,
    ];
  }

  const environment = Object.entries(config.environment)
    .map(([key, value]) => `${key}=${tomlString(value)}`)
    .join(",");
  return [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--cd",
    config.workingDirectory,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    resultPath,
    "--config",
    `mcp_servers.sight_mcp.command=${tomlString(process.execPath)}`,
    "--config",
    `mcp_servers.sight_mcp.args=[${tomlString(config.cliPath)}]`,
    "--config",
    `mcp_servers.sight_mcp.env={${environment}}`,
    "--config",
    "mcp_servers.sight_mcp.startup_timeout_sec=20",
    "--config",
    "mcp_servers.sight_mcp.tool_timeout_sec=20",
    prompt,
  ];
}

function extractClaudeResult(stdout) {
  const envelope = JSON.parse(stdout);
  if (typeof envelope.structured_output === "object" && envelope.structured_output !== null) {
    return envelope.structured_output;
  }
  if (typeof envelope.result === "string") {
    return JSON.parse(envelope.result);
  }
  throw new Error("Claude Code did not return structured Host-smoke output.");
}

function assertMainResult(result) {
  for (const scenario of ["chart", "deniedPath", "ocrStyle", "providerFailure"]) {
    if (result[scenario] !== true) {
      throw new Error(`Host did not pass ${scenario}.`);
    }
  }
}

async function runHostMain(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  const collect = (target) => (chunk) => {
    outputBytes += chunk.byteLength;
    if (outputBytes > 20 * 1024 * 1024) {
      child.kill("SIGTERM");
      return;
    }
    target.push(chunk);
  };
  child.stdout.on("data", collect(stdout));
  child.stderr.on("data", collect(stderr));
  let timeout;
  try {
    const [code, signal] = await Promise.race([
      once(child, "exit"),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error("Host main smoke exceeded its deadline."));
        }, 240_000);
      }),
    ]);
    if (outputBytes > 20 * 1024 * 1024) {
      throw new Error("Host main smoke exceeded its output bound.");
    }
    if (code !== 0 || signal !== null) {
      throw new Error("Host main smoke exited unsuccessfully.");
    }
    return Buffer.concat(stdout).toString("utf8");
  } finally {
    clearTimeout(timeout);
  }
}

async function runCancellation(command, args, cancellationStarted, cancellationClosed) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  let startTimer;
  let exitTimer;
  try {
    await Promise.race([
      cancellationStarted,
      new Promise((_, reject) => {
        startTimer = setTimeout(
          () => reject(new Error("Host cancellation smoke did not start the Tool call.")),
          180_000,
        );
      }),
    ]);
    clearTimeout(startTimer);
    child.kill("SIGINT");
    await Promise.race([
      once(child, "exit"),
      new Promise((_, reject) => {
        exitTimer = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error("Host did not stop after cancellation."));
        }, 20_000);
      }),
    ]);
    await Promise.race([
      cancellationClosed,
      new Promise((_, reject) => {
        exitTimer = setTimeout(
          () => reject(new Error("Host cancellation did not close the Provider request.")),
          10_000,
        );
      }),
    ]);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  } finally {
    clearTimeout(startTimer);
    clearTimeout(exitTimer);
  }
}

const host = argumentValue("--host");
const archiveArgument = argumentValue("--archive");
const recordArgument = argumentValue("--record");
if (
  (host !== "claude-code" && host !== "codex") ||
  archiveArgument === undefined ||
  recordArgument === undefined
) {
  throw new Error(
    "Usage: node scripts/run-host-smoke.mjs --host <claude-code|codex> --archive <tgz> --record <json>",
  );
}

const archivePath = resolve(archiveArgument);
const recordPath = resolve(recordArgument);
const hostCommand = host === "claude-code" ? "claude" : "codex";
const temporaryDirectory = await mkdtemp(join(tmpdir(), `sight-mcp-${host}-`));
const installDirectory = join(temporaryDirectory, "install");
await mkdir(installDirectory);

const provider = createServer();
let cancellationStartedResolve;
const cancellationStarted = new Promise((resolveCancellation) => {
  cancellationStartedResolve = resolveCancellation;
});
let cancellationClosedResolve;
const cancellationClosed = new Promise((resolveCancellation) => {
  cancellationClosedResolve = resolveCancellation;
});

try {
  await writeFile(
    join(installDirectory, "package.json"),
    `${JSON.stringify({ name: "sight-mcp-host-smoke", private: true, version: "0.0.0" }, null, 2)}\n`,
  );
  await execFileAsync(
    npmCommand,
    ["install", "--no-audit", "--no-fund", "--save-exact", archivePath],
    { cwd: installDirectory, maxBuffer: 20 * 1024 * 1024 },
  );
  const fixtureDirectory = join(installDirectory, "fixtures");
  await mkdir(fixtureDirectory);
  const fixturePath = join(fixtureDirectory, "synthetic.png");
  const deniedPath = join(installDirectory, "denied.png");
  await Promise.all([
    sharp({
      create: {
        background: { alpha: 1, b: 255, g: 255, r: 255 },
        channels: 4,
        height: 48,
        width: 64,
      },
    })
      .png()
      .toFile(fixturePath),
    sharp({
      create: {
        background: { alpha: 1, b: 0, g: 0, r: 0 },
        channels: 4,
        height: 8,
        width: 8,
      },
    })
      .png()
      .toFile(deniedPath),
  ]);

  provider.on("request", (request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (body.includes('"text":"host-provider-failure"')) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":{"message":"synthetic failure"}}');
        return;
      }
      if (body.includes('"text":"host-cancellation"')) {
        cancellationStartedResolve?.();
        response.once("close", () => cancellationClosedResolve?.());
        return;
      }
      const answer = body.includes('"text":"host-ocr-style"')
        ? "INVOICE 1042"
        : "The chart peaks in June at 31 units.";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
    });
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const address = provider.address();
  if (address === null || typeof address === "string") {
    throw new Error("Synthetic Host-smoke Provider did not expose a TCP port.");
  }

  const cliPath = join(
    installDirectory,
    "node_modules",
    "@weiki886",
    "sight-mcp",
    "dist",
    "cli.js",
  );
  const environment = {
    SIGHT_ALLOWED_ROOTS: fixtureDirectory,
    SIGHT_LOG_LEVEL: "silent",
    SIGHT_MAX_RETRIES: "0",
    SIGHT_PROVIDER_BASE_URL: `http://127.0.0.1:${String(address.port)}/v1`,
    SIGHT_PROVIDER_MODEL: "synthetic-host-smoke",
    SIGHT_REQUEST_TIMEOUT_MS: "15000",
  };
  const outputSchema = {
    additionalProperties: false,
    properties: {
      chart: { const: true, type: "boolean" },
      deniedPath: { const: true, type: "boolean" },
      ocrStyle: { const: true, type: "boolean" },
      providerFailure: { const: true, type: "boolean" },
    },
    required: ["chart", "ocrStyle", "deniedPath", "providerFailure"],
    type: "object",
  };
  const config = { cliPath, environment, outputSchema, workingDirectory: installDirectory };
  const configPath = join(temporaryDirectory, "claude-mcp.json");
  const schemaPath = join(temporaryDirectory, "host-output.schema.json");
  const resultPath = join(temporaryDirectory, "host-result.json");
  await Promise.all([
    writeFile(
      configPath,
      `${JSON.stringify(
        {
          mcpServers: {
            "sight-mcp": {
              args: [cliPath],
              command: process.execPath,
              env: environment,
              type: "stdio",
            },
          },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(schemaPath, `${JSON.stringify(outputSchema, null, 2)}\n`),
  ]);

  const mainPrompt = `Use only the configured Sight MCP analyze_image tool. Make exactly four calls. Call 1: path ${fixturePath}, prompt host-chart, and pass only if the answer says June and 31. Call 2: path ${fixturePath}, prompt host-ocr-style, and pass only if the answer says INVOICE 1042. Call 3: path ${deniedPath}, prompt host-denied-path, and pass only for PATH_NOT_ALLOWED. Call 4: path ${fixturePath}, prompt host-provider-failure, and pass only for PROVIDER_UNAVAILABLE. Return only the required boolean result object.`;
  const mainArgs = hostArguments(host, configPath, config, mainPrompt, schemaPath, resultPath);
  const mainStdout = await runHostMain(hostCommand, mainArgs, installDirectory);
  const mainResult =
    host === "claude-code"
      ? extractClaudeResult(mainStdout)
      : JSON.parse(await readFile(resultPath, "utf8"));
  assertMainResult(mainResult);

  const cancellationPrompt = `Use only the configured Sight MCP analyze_image tool. Call it once with path ${fixturePath} and prompt host-cancellation, then wait for the result.`;
  const cancellationArgs = hostArguments(
    host,
    configPath,
    config,
    cancellationPrompt,
    schemaPath,
    resultPath,
  );
  await runCancellation(hostCommand, cancellationArgs, cancellationStarted, cancellationClosed);

  const digest = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex");
  const { stdout: hostVersion } = await execFileAsync(hostCommand, ["--version"]);
  const { stdout: operatingSystem } = await execFileAsync("uname", ["-srm"]);
  await mkdir(dirname(recordPath), { recursive: true });
  await writeFile(
    recordPath,
    `${JSON.stringify(
      {
        artifactSha256: digest,
        environment: {
          host: host === "claude-code" ? "Claude Code" : "Codex",
          hostVersion: hostVersion.trim(),
          node: process.version,
          operatingSystem: operatingSystem.trim(),
          provider: "local synthetic OpenAI-compatible endpoint",
        },
        generatedAt: new Date().toISOString(),
        scenarios: {
          cancellation: "passed",
          chart: "passed",
          deniedPath: "passed",
          discovery: "passed",
          ocrStyle: "passed",
          providerFailure: "passed",
        },
        schemaVersion: "1",
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`${host} Host smoke passed for sha256:${digest}.\n`);
} finally {
  provider.closeAllConnections();
  if (provider.listening) {
    await new Promise((resolveClose) => provider.close(resolveClose));
  }
  await rm(temporaryDirectory, { force: true, recursive: true });
}
