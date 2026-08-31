import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const nodeCommand = process.execPath;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

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

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function assertToolResult(result, expectedStatus, expectedCode) {
  const structured = result.structuredContent;
  if (
    typeof structured !== "object" ||
    structured === null ||
    structured.status !== expectedStatus ||
    (expectedCode !== undefined && structured.error?.code !== expectedCode)
  ) {
    throw new Error(
      `Unexpected Tool result for ${expectedStatus}${expectedCode === undefined ? "" : `/${expectedCode}`}.`,
    );
  }
}

function waitForSignal(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      timer.unref();
    }),
  ]);
}

async function runInstalledSmoke(archivePath, installDirectory) {
  await writeFile(
    join(installDirectory, "package.json"),
    `${JSON.stringify({ name: "sight-mcp-candidate-smoke", private: true, version: "0.0.0" }, null, 2)}\n`,
  );
  await execFileAsync(
    npmCommand,
    ["install", "--no-audit", "--no-fund", "--save-exact", archivePath],
    { cwd: installDirectory, maxBuffer: 20 * 1024 * 1024 },
  );

  const fixtureDirectory = join(installDirectory, "fixtures");
  await mkdir(fixtureDirectory);
  const chartPath = join(fixtureDirectory, "synthetic-chart.png");
  const ocrPath = join(fixtureDirectory, "synthetic-ocr.png");
  const deniedPath = join(installDirectory, "outside-allowed-root.png");
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
      .toFile(chartPath),
    sharp({
      create: {
        background: { alpha: 1, b: 240, g: 240, r: 240 },
        channels: 4,
        height: 32,
        width: 96,
      },
    })
      .png()
      .toFile(ocrPath),
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

  let cancellationStartedResolve;
  const cancellationStarted = new Promise((resolveCancellation) => {
    cancellationStartedResolve = resolveCancellation;
  });
  const provider = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (body.includes('"text":"provider-failure-smoke"')) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":{"message":"synthetic failure"}}');
        return;
      }
      if (body.includes('"text":"cancellation-smoke"')) {
        cancellationStartedResolve?.();
        return;
      }
      const answer = body.includes('"text":"ocr-style-smoke"')
        ? "INVOICE 1042"
        : "The chart peaks in June at 31 units.";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [{ message: { content: answer } }],
          usage: { completion_tokens: 4, prompt_tokens: 8, total_tokens: 12 },
        }),
      );
    });
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const address = provider.address();
  if (address === null || typeof address === "string") {
    throw new Error("Synthetic Provider did not expose a TCP port.");
  }

  const installedPackageRoot = await realpath(
    join(installDirectory, "node_modules", "@weiki886", "sight-mcp"),
  );
  const cliPath = join(installedPackageRoot, "dist", "cli.js");
  const transport = new StdioClientTransport({
    args: [cliPath],
    command: nodeCommand,
    cwd: installDirectory,
    env: {
      SIGHT_ALLOWED_ROOTS: fixtureDirectory,
      SIGHT_LOG_LEVEL: "debug",
      SIGHT_MAX_RETRIES: "0",
      SIGHT_PROVIDER_BASE_URL: `http://127.0.0.1:${String(address.port)}/v1`,
      SIGHT_PROVIDER_MODEL: "synthetic-release-smoke",
      SIGHT_REQUEST_TIMEOUT_MS: "10000",
    },
    stderr: "pipe",
  });
  const stderrChunks = [];
  transport.stderr?.on("data", (chunk) => stderrChunks.push(chunk.toString("utf8")));
  const client = new Client({ name: "sight-mcp-release-smoke", version: "0.1.0" });

  try {
    await client.connect(transport);
    const listing = await client.listTools();
    if (listing.tools.length !== 1 || listing.tools[0]?.name !== "analyze_image") {
      throw new Error("Clean install did not discover exactly analyze_image.");
    }

    const chart = await client.callTool({
      arguments: { path: chartPath, prompt: "chart-smoke" },
      name: "analyze_image",
    });
    assertToolResult(chart, "ok");

    const ocr = await client.callTool({
      arguments: { path: ocrPath, prompt: "ocr-style-smoke" },
      name: "analyze_image",
    });
    assertToolResult(ocr, "ok");

    const denied = await client.callTool({
      arguments: { path: deniedPath, prompt: "denied-path-smoke" },
      name: "analyze_image",
    });
    assertToolResult(denied, "error", "PATH_NOT_ALLOWED");

    const providerFailure = await client.callTool({
      arguments: { path: chartPath, prompt: "provider-failure-smoke" },
      name: "analyze_image",
    });
    assertToolResult(providerFailure, "error", "PROVIDER_UNAVAILABLE");

    const controller = new globalThis.AbortController();
    const cancellation = client.callTool(
      {
        arguments: { path: chartPath, prompt: "cancellation-smoke" },
        name: "analyze_image",
      },
      { signal: controller.signal },
    );
    await waitForSignal(cancellationStarted, 5_000, "Cancellation smoke did not reach Provider.");
    controller.abort();
    let cancellationRejected = false;
    try {
      await cancellation;
    } catch {
      cancellationRejected = true;
    }
    if (!cancellationRejected) {
      throw new Error("Cancelled clean-install Tool call did not reject at the client boundary.");
    }

    const afterCancellation = await client.callTool({
      arguments: { path: chartPath, prompt: "after-cancellation-smoke" },
      name: "analyze_image",
    });
    assertToolResult(afterCancellation, "ok");
  } finally {
    await client.close().catch(() => undefined);
    provider.closeAllConnections();
    await new Promise((resolveClose) => provider.close(resolveClose));
  }

  const stderr = stderrChunks.join("");
  for (const sensitiveValue of [
    installDirectory,
    fixtureDirectory,
    chartPath,
    ocrPath,
    deniedPath,
    "chart-smoke",
    "ocr-style-smoke",
    "provider-failure-smoke",
    "cancellation-smoke",
  ]) {
    if (stderr.includes(sensitiveValue)) {
      throw new Error("Clean-install stderr exposed a path or prompt.");
    }
  }

  const { stdout: sbomOutput } = await execFileAsync(
    npmCommand,
    ["sbom", "--omit", "dev", "--sbom-format", "cyclonedx", "--sbom-type", "application"],
    { cwd: installDirectory, maxBuffer: 30 * 1024 * 1024 },
  );
  const sbom = JSON.parse(sbomOutput);
  if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion === undefined) {
    throw new Error("npm did not generate a valid CycloneDX SBOM.");
  }

  return Object.freeze({
    sbom,
    scenarios: Object.freeze({
      cancellation: "passed",
      chart: "passed",
      cleanInstall: "passed",
      deniedPath: "passed",
      discovery: "passed",
      ocrStyle: "passed",
      providerFailure: "passed",
      recoveryAfterCancellation: "passed",
    }),
  });
}

const outputArgument = argumentValue("--output");
if (outputArgument === undefined) {
  throw new Error("Usage: pnpm release:candidate -- --output <empty-directory>");
}
const outputDirectory = resolve(projectRoot, outputArgument);
if (outputDirectory === projectRoot) {
  throw new Error("Release candidate output cannot be the project root.");
}
await mkdir(outputDirectory, { recursive: true });
if ((await readdir(outputDirectory)).length !== 0) {
  throw new Error("Release candidate output directory must be empty.");
}

const cleanInstallDirectory = await mkdtemp(join(tmpdir(), "sight-mcp-clean-install-"));
try {
  await execFileAsync(pnpmCommand, ["build"], { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024 });
  await execFileAsync(pnpmCommand, ["pack", "--pack-destination", outputDirectory], {
    cwd: projectRoot,
    maxBuffer: 20 * 1024 * 1024,
  });
  const archives = (await readdir(outputDirectory)).filter((entry) => entry.endsWith(".tgz"));
  if (archives.length !== 1 || archives[0] === undefined) {
    throw new Error(`Expected exactly one candidate tarball, found ${archives.length}.`);
  }
  const archivePath = join(outputDirectory, archives[0]);
  await execFileAsync(
    nodeCommand,
    [join(projectRoot, "scripts", "check-pack.mjs"), "--archive", archivePath],
    {
      cwd: projectRoot,
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const digest = await sha256(archivePath);
  const smoke = await runInstalledSmoke(archivePath, cleanInstallDirectory);
  const sbomName = "sight-mcp-0.1.0.sbom.cdx.json";
  await writeFile(join(outputDirectory, sbomName), `${JSON.stringify(smoke.sbom, null, 2)}\n`);

  const sourceCommit =
    process.env["SOURCE_COMMIT"] ??
    (
      await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: projectRoot,
      })
    ).stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error("SOURCE_COMMIT must be a full Git commit SHA.");
  }
  const generatedAt = new Date().toISOString();
  const manifest = Object.freeze({
    artifact: Object.freeze({
      file: basename(archivePath),
      packageName: "@weiki886/sight-mcp",
      sha256: digest,
      version: "0.1.0",
    }),
    environment: Object.freeze({
      architecture: process.arch,
      node: process.version,
      platform: process.platform,
    }),
    generatedAt,
    sbom: Object.freeze({ file: sbomName, format: "CycloneDX", generatedBy: "npm sbom" }),
    schemaVersion: "1",
    smoke: smoke.scenarios,
    source: Object.freeze({ commit: sourceCommit }),
  });
  await writeFile(
    join(outputDirectory, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(outputDirectory, "clean-install-smoke.json"),
    `${JSON.stringify(
      {
        artifactSha256: digest,
        environment: manifest.environment,
        generatedAt,
        host: "official MCP client",
        scenarios: smoke.scenarios,
        schemaVersion: "1",
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(`Release candidate ready: ${basename(archivePath)} (sha256:${digest}).\n`);
} catch (error) {
  await rm(outputDirectory, { force: true, recursive: true });
  throw error;
} finally {
  await rm(cleanInstallDirectory, { force: true, recursive: true });
}
