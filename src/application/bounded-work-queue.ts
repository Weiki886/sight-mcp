export interface WorkLease {
  readonly release: () => void;
}

export type AcquireResult =
  | Readonly<{ kind: "acquired"; lease: WorkLease }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "full" }>;

export interface BoundedWorkQueue {
  readonly acquire: (signal: AbortSignal) => Promise<AcquireResult>;
}

interface Waiter {
  readonly resolve: (result: AcquireResult) => void;
  readonly signal: AbortSignal;
  readonly stopWaiting: () => void;
}

export function createBoundedWorkQueue(
  maxConcurrency: number,
  maxQueueSize: number,
): BoundedWorkQueue {
  let active = 0;
  const waiters: Waiter[] = [];

  const createLease = (): WorkLease => {
    let released = false;
    return Object.freeze({
      release: () => {
        if (released) {
          return;
        }
        released = true;
        active -= 1;

        while (waiters.length > 0) {
          const waiter = waiters.shift();
          if (waiter === undefined) {
            return;
          }
          waiter.stopWaiting();
          if (waiter.signal.aborted) {
            waiter.resolve(Object.freeze({ kind: "cancelled" }));
            continue;
          }
          active += 1;
          waiter.resolve(Object.freeze({ kind: "acquired", lease: createLease() }));
          return;
        }
      },
    });
  };

  return Object.freeze({
    acquire(signal: AbortSignal): Promise<AcquireResult> {
      if (signal.aborted) {
        return Promise.resolve(Object.freeze({ kind: "cancelled" }));
      }
      if (active < maxConcurrency) {
        active += 1;
        return Promise.resolve(Object.freeze({ kind: "acquired", lease: createLease() }));
      }
      if (waiters.length >= maxQueueSize) {
        return Promise.resolve(Object.freeze({ kind: "full" }));
      }

      return new Promise((resolve) => {
        const abort = () => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) {
            waiters.splice(index, 1);
            signal.removeEventListener("abort", abort);
            resolve(Object.freeze({ kind: "cancelled" }));
          }
        };
        const waiter: Waiter = {
          resolve,
          signal,
          stopWaiting: () => {
            signal.removeEventListener("abort", abort);
          },
        };
        waiters.push(waiter);
        signal.addEventListener("abort", abort, { once: true });
      });
    },
  });
}
