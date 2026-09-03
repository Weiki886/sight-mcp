import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  discoverClientRoots,
  type ClientRoot,
  type ClientRootsSource,
} from "../../src/infrastructure/mcp/client-roots.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sight-mcp-client-roots-"));
  temporaryDirectories.push(directory);
  return await realpath(directory);
}

function sourceReturning(roots: readonly ClientRoot[]): ClientRootsSource {
  return Object.freeze({
    listRoots: () => Promise.resolve({ roots }),
    supportsRoots: () => true,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("client roots discovery", () => {
  it("adopts a file:// workspace root as a canonical directory", async () => {
    const directory = await temporaryDirectory();
    const workspace = join(directory, "workspace");
    await mkdir(workspace);

    const result = await discoverClientRoots(
      sourceReturning([{ uri: pathToFileURL(workspace).href }]),
    );

    expect(result.roots).toEqual([await realpath(workspace)]);
    expect(result.warnings).toEqual([]);
  });

  it("skips the request entirely when the client lacks the roots capability", async () => {
    const listRoots = vi.fn<(signal: AbortSignal) => Promise<{ roots: readonly ClientRoot[] }>>();
    const result = await discoverClientRoots({ listRoots, supportsRoots: () => false });

    expect(listRoots).not.toHaveBeenCalled();
    expect(result.roots).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("degrades silently when roots/list is unsupported by the protocol era", async () => {
    const result = await discoverClientRoots({
      listRoots: () =>
        Promise.reject(new Error("Server-to-client requests are not available on 2026-07-28")),
      supportsRoots: () => true,
    });

    expect(result.roots).toEqual([]);
    expect(result.warnings).toEqual(["ROOTS_UNAVAILABLE"]);
  });

  it("degrades when the client never answers", async () => {
    const result = await discoverClientRoots(
      {
        listRoots: (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          }),
        supportsRoots: () => true,
      },
      10,
    );

    expect(result.roots).toEqual([]);
    expect(result.warnings).toEqual(["ROOTS_UNAVAILABLE"]);
  });

  it("refuses the filesystem root and the home directory", async () => {
    const result = await discoverClientRoots(
      sourceReturning([
        { uri: pathToFileURL(parse(process.cwd()).root).href },
        { uri: pathToFileURL(homedir()).href },
      ]),
    );

    expect(result.roots).toEqual([]);
    expect(result.warnings).toEqual(["BROAD_CLIENT_ROOT"]);
  });

  it("ignores non-file schemes, missing directories, and plain files", async () => {
    const directory = await temporaryDirectory();
    const file = join(directory, "not-a-directory.txt");
    await writeFile(file, "x");

    const result = await discoverClientRoots(
      sourceReturning([
        { uri: "https://example.com/workspace" },
        { uri: pathToFileURL(join(directory, "missing")).href },
        { uri: pathToFileURL(file).href },
      ]),
    );

    expect(result.roots).toEqual([]);
  });

  it("collapses a nested root into its parent", async () => {
    const directory = await temporaryDirectory();
    const parent = join(directory, "workspace");
    const child = join(parent, "packages", "app");
    await mkdir(child, { recursive: true });

    const result = await discoverClientRoots(
      sourceReturning([{ uri: pathToFileURL(child).href }, { uri: pathToFileURL(parent).href }]),
    );

    expect(result.roots).toEqual([await realpath(parent)]);
  });

  it("resolves a symlinked root to its target so the guard compares canonical paths", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "real-workspace");
    await mkdir(target);
    const link = join(directory, "linked-workspace");
    const { symlink } = await import("node:fs/promises");
    await symlink(target, link);

    const result = await discoverClientRoots(sourceReturning([{ uri: pathToFileURL(link).href }]));

    expect(result.roots).toEqual([await realpath(target)]);
  });
});
