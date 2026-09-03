import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootsRequestTimeoutMs = 3_000;

export interface ClientRoot {
  readonly uri: string;
}

export interface ClientRootsSource {
  /**
   * Whether the connected client advertised the `roots` capability. Checked
   * before any request so an unsupported client costs no round trip.
   */
  readonly supportsRoots: () => boolean;
  readonly listRoots: (signal: AbortSignal) => Promise<{ readonly roots: readonly ClientRoot[] }>;
}

export type RootsDiscoveryWarning = "BROAD_CLIENT_ROOT" | "ROOTS_UNAVAILABLE";

export interface RootsDiscoveryResult {
  readonly roots: readonly string[];
  readonly warnings: readonly RootsDiscoveryWarning[];
}

function isWithinRoot(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

/**
 * Drops any root already covered by a shorter one, mirroring the collapsing
 * that `config.ts` applies to `SIGHT_ALLOWED_ROOTS`.
 */
function collapseNestedRoots(roots: readonly string[]): readonly string[] {
  const sortedRoots = [...new Set(roots)].sort(
    (left, right) => left.length - right.length || left.localeCompare(right),
  );
  const collapsed: string[] = [];

  for (const root of sortedRoots) {
    if (!collapsed.some((parent) => isWithinRoot(parent, root))) {
      collapsed.push(root);
    }
  }

  return Object.freeze(collapsed);
}

/**
 * A client may legitimately report `/` or the home directory as a workspace
 * root, but adopting one would erase the allowed-root boundary entirely, so
 * such a root is refused and surfaced as a warning instead.
 */
function isBroadRoot(root: string, canonicalHome: string | undefined): boolean {
  return root === parse(root).root || root === canonicalHome;
}

/** Only `file://` roots denote local directories; other schemes are ignored. */
function rootToPath(uri: string): string | undefined {
  if (!uri.startsWith("file://")) {
    return undefined;
  }
  try {
    const path = fileURLToPath(uri);
    return isAbsolute(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

async function canonicalDirectory(path: string): Promise<string | undefined> {
  try {
    const canonicalPath = await realpath(path);
    const status = await stat(canonicalPath);
    return status.isDirectory() ? canonicalPath : undefined;
  } catch {
    return undefined;
  }
}

async function canonicalHomeDirectory(): Promise<string | undefined> {
  try {
    return await realpath(homedir());
  } catch {
    return undefined;
  }
}

/**
 * Resolves the client's workspace roots into canonical directories that are
 * safe to treat as allowed roots.
 *
 * `roots/list` is deprecated as of MCP revision 2026-07-28 (SEP-2577) and the
 * SDK throws rather than sending the request on that era, so every failure
 * mode here degrades silently: the caller keeps working with configured roots
 * and the authorization dialog.
 */
export async function discoverClientRoots(
  source: ClientRootsSource,
  timeoutMs: number = rootsRequestTimeoutMs,
): Promise<RootsDiscoveryResult> {
  if (!source.supportsRoots()) {
    return Object.freeze({ roots: Object.freeze([]), warnings: Object.freeze([]) });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  timeout.unref();

  let listed: { readonly roots: readonly ClientRoot[] };
  try {
    listed = await source.listRoots(controller.signal);
  } catch {
    return Object.freeze({
      roots: Object.freeze([]),
      warnings: Object.freeze<RootsDiscoveryWarning[]>(["ROOTS_UNAVAILABLE"]),
    });
  } finally {
    clearTimeout(timeout);
  }

  const canonicalHome = await canonicalHomeDirectory();
  const accepted: string[] = [];
  const warnings = new Set<RootsDiscoveryWarning>();

  for (const root of listed.roots) {
    const path = rootToPath(root.uri);
    if (path === undefined) {
      continue;
    }
    const canonicalPath = await canonicalDirectory(path);
    if (canonicalPath === undefined) {
      continue;
    }
    if (isBroadRoot(canonicalPath, canonicalHome)) {
      warnings.add("BROAD_CLIENT_ROOT");
      continue;
    }
    accepted.push(canonicalPath);
  }

  return Object.freeze({
    roots: collapseNestedRoots(accepted),
    warnings: Object.freeze([...warnings]),
  });
}
