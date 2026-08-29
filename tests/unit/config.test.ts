import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigError, imageConfigDefaults, loadConfig } from "../../src/config.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sight-mcp-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("loadConfig", () => {
  it("uses the canonical working directory and documented safe defaults", async () => {
    const directory = await temporaryDirectory();

    await expect(loadConfig({}, { cwd: directory })).resolves.toEqual({
      image: {
        allowedRoots: [await realpath(directory)],
        ...imageConfigDefaults,
      },
      logLevel: "info",
      warnings: [],
    });
  });

  it("returns an immutable typed configuration", async () => {
    const directory = await temporaryDirectory();
    const config = await loadConfig({ SIGHT_LOG_LEVEL: "debug" }, { cwd: directory });

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.image)).toBe(true);
    expect(Object.isFrozen(config.image.allowedRoots)).toBe(true);
    expect(Object.isFrozen(config.warnings)).toBe(true);
  });

  it("canonicalizes, deduplicates, and collapses nested allowed roots", async () => {
    const directory = await temporaryDirectory();
    const nested = join(directory, "nested");
    await mkdir(nested);

    const config = await loadConfig(
      { SIGHT_ALLOWED_ROOTS: `${nested};${directory};${nested}` },
      { cwd: directory, pathDelimiter: ";" },
    );

    expect(config.image.allowedRoots).toEqual([await realpath(directory)]);
  });

  it("rejects relative, missing, and non-directory roots without exposing their values", async () => {
    const directory = await temporaryDirectory();
    const canary = join(directory, "private-canary");
    await writeFile(canary, "secret");

    for (const value of ["relative-secret", join(directory, "missing-secret"), canary]) {
      let received: unknown;
      try {
        await loadConfig({ SIGHT_ALLOWED_ROOTS: value }, { cwd: directory });
      } catch (error: unknown) {
        received = error;
      }

      expect(received).toBeInstanceOf(ConfigError);
      expect(String(received)).not.toContain(value);
    }
  });

  it("rejects invalid values and cross-field limits without echoing input", async () => {
    const directory = await temporaryDirectory();
    const secretValue = "secret-value-that-must-not-be-logged";

    await expect(loadConfig({ SIGHT_LOG_LEVEL: secretValue }, { cwd: directory })).rejects.toThrow(
      "SIGHT_LOG_LEVEL is invalid.",
    );
    await expect(loadConfig({ SIGHT_MAX_IMAGE_BYTES: "0" }, { cwd: directory })).rejects.toThrow(
      "SIGHT_MAX_IMAGE_BYTES is invalid.",
    );
    await expect(
      loadConfig(
        { SIGHT_MAX_IMAGE_BYTES: "2048", SIGHT_MAX_TRANSMIT_BYTES: "4096" },
        { cwd: directory },
      ),
    ).rejects.toThrow("SIGHT_MAX_TRANSMIT_BYTES must not exceed SIGHT_MAX_IMAGE_BYTES.");

    try {
      await loadConfig({ SIGHT_LOG_LEVEL: secretValue }, { cwd: directory });
    } catch (error: unknown) {
      expect(String(error)).not.toContain(secretValue);
    }
  });

  it("warns when the filesystem root is allowed", async () => {
    const directory = await temporaryDirectory();
    const filesystemRoot = parse(directory).root;

    const config = await loadConfig({ SIGHT_ALLOWED_ROOTS: filesystemRoot }, { cwd: directory });

    expect(config.warnings).toEqual(["BROAD_ALLOWED_ROOT"]);
  });
});
