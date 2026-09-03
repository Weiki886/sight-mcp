import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { OutsideRootAuthorizer } from "../../src/infrastructure/filesystem/node-input-guard.js";
import {
  createCachingOutsideRootAuthorizer,
  createSessionAccessCache,
} from "../../src/infrastructure/filesystem/session-access-cache.js";

function allowOnce(): ReturnType<typeof vi.fn<OutsideRootAuthorizer>> {
  return vi.fn<OutsideRootAuthorizer>(() => Promise.resolve("ALLOWED"));
}

describe("session access cache", () => {
  it("covers sibling files once a directory is approved", () => {
    const cache = createSessionAccessCache();
    cache.remember("/tmp/shots/a.png");

    expect(cache.covers("/tmp/shots/b.png")).toBe(true);
    expect(cache.covers("/tmp/shots/nested/c.png")).toBe(true);
    expect(cache.covers("/tmp/other/d.png")).toBe(false);
  });

  it("never widens a grant beyond the approved directory", () => {
    const cache = createSessionAccessCache();
    cache.remember("/tmp/shots/deep/a.png");

    expect(cache.covers("/tmp/shots/sibling.png")).toBe(false);
    expect(cache.covers("/tmp/a.png")).toBe(false);
    expect(cache.directories()).toEqual(["/tmp/shots/deep"]);
  });

  it("refuses to cache the filesystem root or the home directory", () => {
    const cache = createSessionAccessCache();
    const filesystemRoot = parse(process.cwd()).root;

    cache.remember(join(filesystemRoot, "a.png"));
    cache.remember(join(homedir(), "b.png"));

    expect(cache.directories()).toEqual([]);
    expect(cache.covers(join(homedir(), "b.png"))).toBe(false);
  });

  it("starts empty so grants never survive a restart", () => {
    const first = createSessionAccessCache();
    first.remember("/tmp/shots/a.png");

    expect(createSessionAccessCache().covers("/tmp/shots/a.png")).toBe(false);
  });
});

describe("caching outside-root authorizer", () => {
  it("prompts once per directory and reuses the grant", async () => {
    const authorize = allowOnce();
    const authorizer = createCachingOutsideRootAuthorizer({ authorize });
    const signal = new AbortController().signal;

    await expect(authorizer("/tmp/shots/a.png", signal)).resolves.toBe("ALLOWED");
    await expect(authorizer("/tmp/shots/b.png", signal)).resolves.toBe("ALLOWED");

    expect(authorize).toHaveBeenCalledOnce();
  });

  it("keeps prompting for directories that were never approved", async () => {
    const authorize = allowOnce();
    const authorizer = createCachingOutsideRootAuthorizer({ authorize });
    const signal = new AbortController().signal;

    await authorizer("/tmp/shots/a.png", signal);
    await authorizer("/tmp/elsewhere/b.png", signal);

    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it("does not cache a denial", async () => {
    const authorize = vi.fn<OutsideRootAuthorizer>(() => Promise.resolve("DENIED"));
    const authorizer = createCachingOutsideRootAuthorizer({ authorize });
    const signal = new AbortController().signal;

    await expect(authorizer("/tmp/shots/a.png", signal)).resolves.toBe("DENIED");
    await expect(authorizer("/tmp/shots/a.png", signal)).resolves.toBe("DENIED");

    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it("does not record a grant when the request was aborted mid-dialog", async () => {
    const controller = new AbortController();
    const authorize = vi.fn<OutsideRootAuthorizer>(() => {
      controller.abort();
      return Promise.resolve("ALLOWED");
    });
    const cache = createSessionAccessCache();
    const authorizer = createCachingOutsideRootAuthorizer({ authorize, cache });

    await expect(authorizer("/tmp/shots/a.png", controller.signal)).resolves.toBe("DENIED");
    expect(cache.directories()).toEqual([]);
  });

  it("reports the granted directory to the caller", async () => {
    const onGrant = vi.fn<(directory: string) => void>();
    const authorizer = createCachingOutsideRootAuthorizer({ authorize: allowOnce(), onGrant });

    await authorizer("/tmp/shots/a.png", new AbortController().signal);

    expect(onGrant).toHaveBeenCalledWith(dirname("/tmp/shots/a.png"));
  });
});
