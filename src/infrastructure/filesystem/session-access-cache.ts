import { homedir } from "node:os";
import { dirname, isAbsolute, parse, relative, sep } from "node:path";

import type { OutsideRootAuthorization, OutsideRootAuthorizer } from "./node-input-guard.js";

/**
 * A directory is "broad" when granting it would effectively disable the
 * allowed-root boundary: the filesystem root or the user's home directory.
 * Such a directory is never cached, so each read below it keeps prompting.
 */
function isBroadDirectory(directory: string): boolean {
  if (directory === parse(directory).root) {
    return true;
  }
  try {
    return directory === homedir();
  } catch {
    return false;
  }
}

function isWithinDirectory(directory: string, candidate: string): boolean {
  const difference = relative(directory, candidate);
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

export interface SessionAccessCache {
  /** Records the parent directory of an approved file path. */
  readonly remember: (canonicalPath: string) => void;
  /** True when a previously approved directory already covers this path. */
  readonly covers: (canonicalPath: string) => boolean;
  /** Approved directories, for logging and diagnostics. */
  readonly directories: () => readonly string[];
}

/**
 * In-memory record of directories the user approved during this process.
 *
 * Deliberately never persisted: a restart clears every grant, so a stale
 * approval cannot outlive the session that produced it. Only the immediate
 * parent directory of an approved file is stored — the cache never walks
 * upward, so approving `~/Downloads/a.png` grants `~/Downloads` and nothing
 * above it.
 */
export function createSessionAccessCache(): SessionAccessCache {
  const approved = new Set<string>();

  return Object.freeze({
    covers(canonicalPath: string): boolean {
      for (const directory of approved) {
        if (isWithinDirectory(directory, canonicalPath)) {
          return true;
        }
      }
      return false;
    },
    directories(): readonly string[] {
      return Object.freeze([...approved]);
    },
    remember(canonicalPath: string): void {
      const directory = dirname(canonicalPath);
      if (!isAbsolute(directory) || isBroadDirectory(directory)) {
        return;
      }
      approved.add(directory);
    },
  });
}

export interface CachingAuthorizerOptions {
  readonly authorize: OutsideRootAuthorizer;
  readonly cache?: SessionAccessCache;
  readonly onGrant?: (directory: string) => void;
}

/**
 * Wraps an authorizer so a directory approved once stays approved for the rest
 * of the process, turning a per-read prompt into a per-directory prompt.
 */
export function createCachingOutsideRootAuthorizer(
  options: CachingAuthorizerOptions,
): OutsideRootAuthorizer {
  const cache = options.cache ?? createSessionAccessCache();

  return async (canonicalPath: string, signal: AbortSignal): Promise<OutsideRootAuthorization> => {
    if (cache.covers(canonicalPath)) {
      return "ALLOWED";
    }

    const authorization = await options.authorize(canonicalPath, signal);
    if (authorization !== "ALLOWED") {
      return authorization;
    }

    // An aborted read must not leave a grant behind: the user may never have
    // seen the dialog that the abort tore down.
    if (signal.aborted) {
      return "DENIED";
    }

    cache.remember(canonicalPath);
    options.onGrant?.(dirname(canonicalPath));
    return "ALLOWED";
  };
}
