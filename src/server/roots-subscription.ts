import type { McpServer } from "@modelcontextprotocol/server";

import {
  discoverClientRoots,
  type ClientRoot,
  type ClientRootsSource,
} from "../infrastructure/mcp/client-roots.js";
import type { Logger } from "../logger.js";

export interface RootsSubscription {
  /** Canonical roots most recently discovered from the client. */
  readonly current: () => readonly string[];
}

interface ListRootsCapableServer {
  readonly getClientCapabilities: () => { readonly roots?: unknown } | undefined;
  readonly listRoots: (
    params?: unknown,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<{ readonly roots: readonly ClientRoot[] }>;
  oninitialized?: (() => void) | undefined;
  readonly setNotificationHandler: (method: string, handler: () => void) => void;
}

/**
 * Adopts the client's workspace roots as allowed roots, refreshing them when
 * the client reports a change.
 *
 * Every step is best effort. `roots/list` is deprecated as of MCP revision
 * 2026-07-28 (SEP-2577) and the SDK refuses to send it on that era, so a
 * client that cannot serve it simply leaves the discovered set empty and the
 * authorization dialog stays in charge.
 */
export function subscribeToClientRoots(server: McpServer, logger: Logger): RootsSubscription {
  const underlying = server.server as unknown as ListRootsCapableServer;
  let discovered: readonly string[] = Object.freeze([]);

  const source: ClientRootsSource = Object.freeze({
    listRoots: (signal: AbortSignal) => underlying.listRoots(undefined, { signal }),
    supportsRoots: () => underlying.getClientCapabilities()?.roots !== undefined,
  });

  const refresh = (): void => {
    void discoverClientRoots(source)
      .then((result) => {
        discovered = result.roots;
        for (const warning of result.warnings) {
          logger.warn("Client workspace root was not adopted", { warning });
        }
        if (result.roots.length > 0) {
          logger.info("Adopted client workspace roots", { rootCount: result.roots.length });
        }
      })
      .catch(() => {
        // Discovery already swallows its failures; this guards the promise
        // chain itself so a rejection can never take down the server.
      });
  };

  const previousOnInitialized = underlying.oninitialized;
  underlying.oninitialized = (): void => {
    previousOnInitialized?.();
    refresh();
  };

  try {
    underlying.setNotificationHandler("notifications/roots/list_changed", refresh);
  } catch {
    // A client that never sends the notification is expected; the initial
    // discovery on initialize still applies.
  }

  return Object.freeze({
    current: () => discovered,
  });
}
