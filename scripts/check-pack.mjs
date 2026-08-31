import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
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

async function archiveContents(archivePath, entry) {
  const { stdout } = await execFileAsync("tar", ["-xOzf", archivePath, entry], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function verifyArchive(archivePath) {
  const rootPackageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  const { stdout: listing } = await execFileAsync("tar", ["-tzf", archivePath]);
  const entries = listing.trim().split("\n");
  const allowedTopLevel = new Set(["package/LICENSE", "package/README.md", "package/package.json"]);
  const forbiddenEntries = entries.filter(
    (entry) => !allowedTopLevel.has(entry) && !entry.startsWith("package/dist/"),
  );
  if (forbiddenEntries.length > 0) {
    throw new Error(`Package contains forbidden entries: ${forbiddenEntries.join(", ")}`);
  }

  for (const requiredEntry of [
    "package/LICENSE",
    "package/README.md",
    "package/package.json",
    "package/dist/cli.js",
  ]) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`Package is missing required entry: ${requiredEntry}`);
    }
  }

  const forbiddenSourceEntries = entries.filter(
    (entry) =>
      entry.startsWith("package/dist/") && entry.endsWith(".ts") && !entry.endsWith(".d.ts"),
  );
  if (forbiddenSourceEntries.length > 0) {
    throw new Error(`Package contains TypeScript source: ${forbiddenSourceEntries.join(", ")}`);
  }

  const cliSource = (await archiveContents(archivePath, "package/dist/cli.js")).toString("utf8");
  if (!cliSource.startsWith("#!/usr/bin/env node\n")) {
    throw new Error("Packaged CLI is missing its Node.js shebang.");
  }
  const { stdout: cliMetadata } = await execFileAsync("tar", [
    "-tvzf",
    archivePath,
    "package/dist/cli.js",
  ]);
  if (!cliMetadata.startsWith("-rwx")) {
    throw new Error("Packaged CLI is not executable.");
  }

  const packedPackageJson = JSON.parse(
    (await archiveContents(archivePath, "package/package.json")).toString("utf8"),
  );
  if (packedPackageJson.name !== "@weiki886/sight-mcp") {
    throw new Error("Package name must remain @weiki886/sight-mcp.");
  }
  if (packedPackageJson.version !== "0.1.0" || rootPackageJson.version !== "0.1.0") {
    throw new Error("Release candidate version must be 0.1.0.");
  }
  if (packedPackageJson.private !== undefined || rootPackageJson.private !== undefined) {
    throw new Error("Release candidate package metadata must not be private.");
  }
  if (packedPackageJson.bin?.["sight-mcp"] !== "./dist/cli.js") {
    throw new Error("Package bin entry does not point to dist/cli.js.");
  }
  if (packedPackageJson.license !== "MIT") {
    throw new Error("Package metadata must declare the MIT license.");
  }
  if (
    packedPackageJson.publishConfig?.access !== "public" ||
    packedPackageJson.publishConfig?.provenance !== true
  ) {
    throw new Error("Package publishConfig must require public access and provenance.");
  }

  const mapEntries = entries.filter((entry) => entry.endsWith(".map"));
  if (mapEntries.length === 0) {
    throw new Error("Package source-map policy expects external map files.");
  }
  for (const mapEntry of mapEntries) {
    const sourceMap = JSON.parse((await archiveContents(archivePath, mapEntry)).toString("utf8"));
    if (sourceMap.sourcesContent !== undefined) {
      throw new Error(`${mapEntry} embeds source content.`);
    }
    if (
      !Array.isArray(sourceMap.sources) ||
      sourceMap.sources.some(
        (source) =>
          typeof source !== "string" ||
          isAbsolute(source) ||
          source.startsWith("file:") ||
          source.includes("/Users/") ||
          /^[A-Za-z]:\\/u.test(source),
      )
    ) {
      throw new Error(`${mapEntry} contains an absolute or invalid source path.`);
    }
  }

  const textEntries = entries.filter(
    (entry) =>
      entry === "package/README.md" ||
      entry === "package/package.json" ||
      /\.(?:js|d\.ts|map)$/u.test(entry),
  );
  for (const textEntry of textEntries) {
    const value = (await archiveContents(archivePath, textEntry)).toString("utf8");
    if (/\/Users\/[^/]+\//u.test(value) || /[A-Za-z]:\\Users\\[^\\]+\\/u.test(value)) {
      throw new Error(`${textEntry} contains a personal absolute path.`);
    }
  }

  const digest = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex");
  process.stdout.write(
    `Package contents verified (${entries.length} entries, sha256:${digest}).\n`,
  );
}

const suppliedArchive = argumentValue("--archive");
const temporaryDirectory =
  suppliedArchive === undefined ? await mkdtemp(join(tmpdir(), "sight-mcp-pack-")) : undefined;

try {
  let archivePath = suppliedArchive;
  if (archivePath === undefined) {
    await execFileAsync(pnpmCommand, ["pack", "--pack-destination", temporaryDirectory], {
      cwd: projectRoot,
    });
    archivePath = join(temporaryDirectory, "weiki886-sight-mcp-0.1.0.tgz");
  }
  await access(archivePath);
  await verifyArchive(archivePath);
} finally {
  if (temporaryDirectory !== undefined) {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}
