import { describe, expect, it } from "vitest";

import { createBoundedWorkQueue } from "../../src/application/bounded-work-queue.js";

describe("bounded work queue", () => {
  it("bounds active work and waiting callers", async () => {
    const queue = createBoundedWorkQueue(1, 1);
    const first = await queue.acquire(new AbortController().signal);
    expect(first.kind).toBe("acquired");

    const secondPromise = queue.acquire(new AbortController().signal);
    await expect(queue.acquire(new AbortController().signal)).resolves.toEqual({ kind: "full" });

    if (first.kind === "acquired") {
      first.lease.release();
    }
    const second = await secondPromise;
    expect(second.kind).toBe("acquired");
    if (second.kind === "acquired") {
      second.lease.release();
      second.lease.release();
    }

    await expect(queue.acquire(new AbortController().signal)).resolves.toMatchObject({
      kind: "acquired",
    });
  });

  it("removes cancelled waiters without consuming queue capacity", async () => {
    const queue = createBoundedWorkQueue(1, 1);
    const first = await queue.acquire(new AbortController().signal);
    const controller = new AbortController();
    const waiting = queue.acquire(controller.signal);

    controller.abort();
    await expect(waiting).resolves.toEqual({ kind: "cancelled" });
    const replacement = queue.acquire(new AbortController().signal);
    await expect(queue.acquire(new AbortController().signal)).resolves.toEqual({ kind: "full" });

    if (first.kind === "acquired") {
      first.lease.release();
    }
    await expect(replacement).resolves.toMatchObject({ kind: "acquired" });
  });

  it("rejects a signal that is already cancelled", async () => {
    const queue = createBoundedWorkQueue(1, 1);
    const controller = new AbortController();
    controller.abort();

    await expect(queue.acquire(controller.signal)).resolves.toEqual({ kind: "cancelled" });
  });
});
