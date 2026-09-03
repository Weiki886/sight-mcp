import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createNodeInputGuard,
  readFileBounded,
} from "../../src/infrastructure/filesystem/node-input-guard.js";
import type { OutsideRootAuthorization } from "../../src/infrastructure/filesystem/node-input-guard.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sight-mcp-input-guard-"));
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

describe("node input guard", () => {
  it("rejects relative paths and sibling-prefix escapes (FS-01)", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "images");
    const sibling = join(directory, "images-private");
    await Promise.all([mkdir(allowed), mkdir(sibling)]);
    const outsideFile = join(sibling, "secret.png");
    await writeFile(outsideFile, "secret");
    const guard = createNodeInputGuard({
      allowedRoots: [await realpath(allowed)],
      maxImageBytes: 100,
    });
    const signal = new AbortController().signal;

    await expect(guard.readAuthorizedImage("relative.png", signal)).resolves.toMatchObject({
      error: { code: "PATH_NOT_ABSOLUTE" },
      ok: false,
    });
    await expect(guard.readAuthorizedImage(outsideFile, signal)).resolves.toMatchObject({
      error: { code: "PATH_NOT_ALLOWED" },
      ok: false,
    });
  });

  it("allows an out-of-root path after a one-time user authorization", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "allowed");
    const outside = join(directory, "outside");
    await Promise.all([mkdir(allowed), mkdir(outside)]);
    const outsideFile = join(outside, "approved.png");
    await writeFile(outsideFile, "approved-bytes");
    const authorizer = vi.fn<
      (_path: string, _signal: AbortSignal) => Promise<OutsideRootAuthorization>
    >(() => Promise.resolve("ALLOWED"));
    const guard = createNodeInputGuard(
      { allowedRoots: [await realpath(allowed)], maxImageBytes: 100 },
      authorizer,
    );

    const result = await guard.readAuthorizedImage(outsideFile, new AbortController().signal);
    expect(result).toMatchObject({ ok: true, value: { originalBytes: 14 } });
    expect(authorizer).toHaveBeenCalledOnce();
  });

  it("returns PATH_ACCESS_DENIED when the user refuses an out-of-root path", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "allowed");
    const outside = join(directory, "outside");
    await Promise.all([mkdir(allowed), mkdir(outside)]);
    const outsideFile = join(outside, "rejected.png");
    await writeFile(outsideFile, "rejected-bytes");
    const authorizer = vi.fn<
      (_path: string, _signal: AbortSignal) => Promise<OutsideRootAuthorization>
    >(() => Promise.resolve("DENIED"));
    const guard = createNodeInputGuard(
      { allowedRoots: [await realpath(allowed)], maxImageBytes: 100 },
      authorizer,
    );

    await expect(
      guard.readAuthorizedImage(outsideFile, new AbortController().signal),
    ).resolves.toMatchObject({ error: { code: "PATH_ACCESS_DENIED" }, ok: false });
    expect(authorizer).toHaveBeenCalledOnce();
  });

  it("keeps returning PATH_NOT_ALLOWED when no out-of-root authorizer is configured", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "allowed");
    const outside = join(directory, "outside");
    await Promise.all([mkdir(allowed), mkdir(outside)]);
    const outsideFile = join(outside, "unapproved.png");
    await writeFile(outsideFile, "unapproved-bytes");
    const guard = createNodeInputGuard({
      allowedRoots: [await realpath(allowed)],
      maxImageBytes: 100,
    });

    await expect(
      guard.readAuthorizedImage(outsideFile, new AbortController().signal),
    ).resolves.toMatchObject({ error: { code: "PATH_NOT_ALLOWED" }, ok: false });
  });

  it("rejects a symlink that resolves outside the allowed root (FS-02)", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "allowed");
    const outside = join(directory, "outside");
    await Promise.all([mkdir(allowed), mkdir(outside)]);
    const secret = join(outside, "secret.png");
    const link = join(allowed, "linked.png");
    await writeFile(secret, "secret");
    await symlink(secret, link);
    const guard = createNodeInputGuard({
      allowedRoots: [await realpath(allowed)],
      maxImageBytes: 100,
    });

    await expect(
      guard.readAuthorizedImage(link, new AbortController().signal),
    ).resolves.toMatchObject({ error: { code: "PATH_NOT_ALLOWED" }, ok: false });
  });

  it("rejects directories and sanitizes missing-file errors (FS-04)", async () => {
    const directory = await temporaryDirectory();
    const canary = join(directory, "private-name-that-must-not-leak.png");
    const guard = createNodeInputGuard({
      allowedRoots: [await realpath(directory)],
      maxImageBytes: 100,
    });
    const signal = new AbortController().signal;

    const directoryResult = await guard.readAuthorizedImage(directory, signal);
    const missingResult = await guard.readAuthorizedImage(canary, signal);

    expect(directoryResult).toMatchObject({ error: { code: "FILE_NOT_REGULAR" }, ok: false });
    expect(missingResult).toMatchObject({ error: { code: "FILE_NOT_FOUND" }, ok: false });
    expect(JSON.stringify(missingResult)).not.toContain(canary);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a named pipe without blocking (FS-04)",
    async () => {
      const directory = await temporaryDirectory();
      const pipe = join(directory, "image.pipe");
      await execFileAsync("mkfifo", [pipe]);
      const guard = createNodeInputGuard({
        allowedRoots: [await realpath(directory)],
        maxImageBytes: 100,
      });

      await expect(
        guard.readAuthorizedImage(pipe, new AbortController().signal),
      ).resolves.toMatchObject({ error: { code: "FILE_NOT_REGULAR" }, ok: false });
    },
  );

  it("accepts the exact byte limit and rejects one byte over it (IMG-01)", async () => {
    const directory = await temporaryDirectory();
    const exact = join(directory, "exact.bin");
    const oversized = join(directory, "oversized.bin");
    await Promise.all([
      writeFile(exact, Buffer.alloc(10, 1)),
      writeFile(oversized, Buffer.alloc(11, 1)),
    ]);
    const guard = createNodeInputGuard({
      allowedRoots: [await realpath(directory)],
      maxImageBytes: 10,
    });
    const signal = new AbortController().signal;

    const exactResult = await guard.readAuthorizedImage(exact, signal);
    expect(exactResult).toMatchObject({ ok: true, value: { originalBytes: 10 } });
    await expect(guard.readAuthorizedImage(oversized, signal)).resolves.toMatchObject({
      error: { code: "FILE_TOO_LARGE" },
      ok: false,
    });
  });

  it("reads one sentinel byte so growth after stat cannot bypass the limit (FS-03/IMG-01)", async () => {
    const source = Buffer.alloc(11, 7);
    const handle = {
      read(buffer: Uint8Array, offset: number, length: number, position: number) {
        const bytesRead = Math.min(length, source.byteLength - position);
        if (bytesRead > 0) {
          buffer.set(source.subarray(position, position + bytesRead), offset);
        }
        return Promise.resolve({ bytesRead });
      },
    };

    await expect(readFileBounded(handle, 10, new AbortController().signal)).resolves.toEqual({
      kind: "too-large",
    });
  });

  it("honors cancellation during a bounded read", async () => {
    const controller = new AbortController();
    let reads = 0;
    const handle = {
      read(buffer: Uint8Array) {
        reads += 1;
        buffer.fill(1);
        controller.abort();
        return Promise.resolve({ bytesRead: buffer.byteLength });
      },
    };

    await expect(readFileBounded(handle, 100_000, controller.signal)).resolves.toEqual({
      kind: "cancelled",
    });
    expect(reads).toBe(1);
  });

  it("honors cancellation before filesystem access", async () => {
    const directory = await temporaryDirectory();
    const controller = new AbortController();
    controller.abort();
    const guard = createNodeInputGuard({
      allowedRoots: [await realpath(directory)],
      maxImageBytes: 100,
    });

    await expect(
      guard.readAuthorizedImage(join(directory, "image.png"), controller.signal),
    ).resolves.toMatchObject({ error: { code: "CANCELLED" }, ok: false });
  });

  it("accepts a path inside a dynamic root discovered from the client workspace", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "allowed");
    const clientWorkspace = join(directory, "workspace");
    await Promise.all([mkdir(allowed), mkdir(clientWorkspace)]);
    const image = join(clientWorkspace, "photo.png");
    await writeFile(image, "photo-data");
    const canonicalWorkspace = await realpath(clientWorkspace);
    const guard = createNodeInputGuard(
      { allowedRoots: [await realpath(allowed)], maxImageBytes: 100 },
      undefined,
      () => [canonicalWorkspace],
    );

    await expect(
      guard.readAuthorizedImage(image, new AbortController().signal),
    ).resolves.toMatchObject({ ok: true, value: { originalBytes: 10 } });
  });

  it("rejects a path outside both configured and dynamic roots", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "allowed");
    const clientWorkspace = join(directory, "workspace");
    const outside = join(directory, "outside");
    await Promise.all([mkdir(allowed), mkdir(clientWorkspace), mkdir(outside)]);
    const image = join(outside, "photo.png");
    await writeFile(image, "photo-data");
    const canonicalWorkspace = await realpath(clientWorkspace);
    const guard = createNodeInputGuard(
      { allowedRoots: [await realpath(allowed)], maxImageBytes: 100 },
      undefined,
      () => [canonicalWorkspace],
    );

    await expect(
      guard.readAuthorizedImage(image, new AbortController().signal),
    ).resolves.toMatchObject({ error: { code: "PATH_NOT_ALLOWED" }, ok: false });
  });

  it("still prompts when a path escapes every root and an authorizer is configured", async () => {
    const directory = await temporaryDirectory();
    const allowed = join(directory, "allowed");
    const outside = join(directory, "outside");
    await Promise.all([mkdir(allowed), mkdir(outside)]);
    const image = join(outside, "photo.png");
    await writeFile(image, "photo-data");
    const authorizer = vi.fn<
      (_path: string, _signal: AbortSignal) => Promise<OutsideRootAuthorization>
    >(() => Promise.resolve("ALLOWED"));
    const guard = createNodeInputGuard(
      { allowedRoots: [await realpath(allowed)], maxImageBytes: 100 },
      authorizer,
      () => [],
    );

    await expect(
      guard.readAuthorizedImage(image, new AbortController().signal),
    ).resolves.toMatchObject({ ok: true, value: { originalBytes: 10 } });
    expect(authorizer).toHaveBeenCalledOnce();
  });

  it("does not let a dynamic root authorize a symlink escape", async () => {
    const directory = await temporaryDirectory();
    const clientWorkspace = join(directory, "workspace");
    const outside = join(directory, "outside");
    await Promise.all([mkdir(clientWorkspace), mkdir(outside)]);
    const secret = join(outside, "secret.png");
    const link = join(clientWorkspace, "linked.png");
    await writeFile(secret, "secret");
    await symlink(secret, link);
    const canonicalWorkspace = await realpath(clientWorkspace);
    const guard = createNodeInputGuard(
      { allowedRoots: [canonicalWorkspace], maxImageBytes: 100 },
      undefined,
      () => [canonicalWorkspace],
    );

    await expect(
      guard.readAuthorizedImage(link, new AbortController().signal),
    ).resolves.toMatchObject({ error: { code: "PATH_NOT_ALLOWED" }, ok: false });
  });
});
