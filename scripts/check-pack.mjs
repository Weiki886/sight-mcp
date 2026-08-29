import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "sight-mcp-pack-"));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

try {
  await execFileAsync(pnpmCommand, ["pack", "--pack-destination", temporaryDirectory], {
    cwd: new URL("../", import.meta.url),
  });

  const archiveNames = (await readdir(temporaryDirectory)).filter((name) => name.endsWith(".tgz"));
  if (archiveNames.length !== 1 || archiveNames[0] === undefined) {
    throw new Error(`Expected one package archive, found ${archiveNames.length}.`);
  }

  const archivePath = join(temporaryDirectory, archiveNames[0]);
  const { stdout: listing } = await execFileAsync("tar", ["-tzf", archivePath]);
  const entries = listing.trim().split("\n");
  const forbiddenEntries = entries.filter(
    (entry) =>
      !["package/LICENSE", "package/README.md", "package/package.json"].includes(entry) &&
      !entry.startsWith("package/dist/"),
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

  const { stdout: cliSource } = await execFileAsync("tar", [
    "-xOzf",
    archivePath,
    "package/dist/cli.js",
  ]);
  if (!cliSource.startsWith("#!/usr/bin/env node\n")) {
    throw new Error("Packaged CLI is missing its Node.js shebang.");
  }

  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (packageJson.bin?.["sight-mcp"] !== "./dist/cli.js") {
    throw new Error("Package bin entry does not point to dist/cli.js.");
  }

  process.stdout.write(`Package contents verified (${entries.length} entries).\n`);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
