import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMacOSClipboardImageReader,
  type OsascriptCommandRunner,
} from "../../src/infrastructure/clipboard/macos-clipboard-image-reader.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function inbox(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sight-mcp-clipboard-"));
  temporaryDirectories.push(directory);
  return directory;
}

const okResult = Object.freeze({
  aborted: false,
  exitCode: 0,
  stdout: new TextEncoder().encode("OK"),
});

function runnerWritingImage() {
  let writtenPath = "";
  const run = vi.fn<OsascriptCommandRunner>(async (argumentsValue) => {
    const path = argumentsValue.at(-1);
    if (typeof path === "string") {
      writtenPath = path;
      await writeFile(path, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]));
    }
    return okResult;
  });
  return { run, writtenPath: () => writtenPath };
}

describe("macOS clipboard image reader", () => {
  it("is unavailable on non-macOS platforms without spawning a reader", async () => {
    const run = vi.fn<OsascriptCommandRunner>(() => Promise.resolve(okResult));
    const reader = createMacOSClipboardImageReader({ platform: "linux", run });

    await expect(reader.read(new AbortController().signal)).resolves.toMatchObject({
      error: { code: "CLIPBOARD_UNAVAILABLE" },
      ok: false,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("returns CANCELLED when the signal is already aborted", async () => {
    const run = vi.fn<OsascriptCommandRunner>(() => Promise.resolve(okResult));
    const reader = createMacOSClipboardImageReader({ platform: "darwin", run });
    const controller = new AbortController();
    controller.abort();

    await expect(reader.read(controller.signal)).resolves.toMatchObject({
      error: { code: "CANCELLED" },
      ok: false,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ["DENIED", "CLIPBOARD_ACCESS_DENIED"],
    ["NO_IMAGE", "CLIPBOARD_NO_IMAGE"],
    ["UNEXPECTED", "CLIPBOARD_READ_FAILED"],
  ] as const)("maps status %s to %s", async (status, code) => {
    const run = vi.fn<OsascriptCommandRunner>(() =>
      Promise.resolve({
        aborted: false,
        exitCode: 0,
        stdout: new TextEncoder().encode(status),
      }),
    );
    const reader = createMacOSClipboardImageReader({
      inboxDirectory: await inbox(),
      platform: "darwin",
      run,
    });

    await expect(reader.read(new AbortController().signal)).resolves.toMatchObject({
      error: { code },
      ok: false,
    });
  });

  it("maps a failed command to CLIPBOARD_READ_FAILED", async () => {
    const run = vi.fn<OsascriptCommandRunner>(() =>
      Promise.resolve({
        aborted: false,
        exitCode: 1,
        stdout: new Uint8Array(),
      }),
    );
    const reader = createMacOSClipboardImageReader({
      inboxDirectory: await inbox(),
      platform: "darwin",
      run,
    });

    await expect(reader.read(new AbortController().signal)).resolves.toMatchObject({
      error: { code: "CLIPBOARD_READ_FAILED" },
      ok: false,
    });
  });

  it("maps an aborted command to CANCELLED", async () => {
    const run = vi.fn<OsascriptCommandRunner>(() =>
      Promise.resolve({
        aborted: true,
        exitCode: null,
        stdout: new Uint8Array(),
      }),
    );
    const reader = createMacOSClipboardImageReader({
      inboxDirectory: await inbox(),
      platform: "darwin",
      run,
    });

    await expect(reader.read(new AbortController().signal)).resolves.toMatchObject({
      error: { code: "CANCELLED" },
      ok: false,
    });
  });

  it("reads the temp file, returns authorized bytes, and removes the temp file", async () => {
    const directory = await inbox();
    const { run, writtenPath } = runnerWritingImage();
    const reader = createMacOSClipboardImageReader({
      inboxDirectory: directory,
      platform: "darwin",
      run,
    });

    const result = await reader.read(new AbortController().signal);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.bytes.byteLength).toBeGreaterThan(0);
      expect(result.value.originalBytes).toBe(result.value.bytes.byteLength);
    }
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]?.[0]).toBe("-e");
    expect(run.mock.calls[0]?.[0]?.[1]).toBeTypeOf("string");
    expect(run.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(writtenPath()).toMatch(/\.png$/);
    await expect(readFile(writtenPath())).rejects.toThrow();
  });

  it("rejects files above the configured byte limit without returning them", async () => {
    const directory = await inbox();
    let writtenPath = "";
    const run = vi.fn<OsascriptCommandRunner>(async (argumentsValue) => {
      const path = argumentsValue.at(-1);
      if (typeof path === "string") {
        writtenPath = path;
        await writeFile(path, new Uint8Array(1_024));
      }
      return okResult;
    });
    const reader = createMacOSClipboardImageReader({
      inboxDirectory: directory,
      maxImageBytes: 512,
      platform: "darwin",
      run,
    });

    await expect(reader.read(new AbortController().signal)).resolves.toMatchObject({
      error: { code: "FILE_TOO_LARGE" },
      ok: false,
    });
    await expect(readFile(writtenPath)).rejects.toThrow();
  });
});
