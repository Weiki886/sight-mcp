import { spawn } from "node:child_process";

export const osascriptCommand = "/usr/bin/osascript";

const commandTimeoutMs = 15_000;
const maximumStatusBytes = 1_024;

export interface OsascriptCommandResult {
  readonly aborted: boolean;
  readonly exitCode: number | null;
  readonly stdout: Uint8Array;
}

export type OsascriptCommandRunner = (
  argumentsValue: readonly string[],
  signal: AbortSignal,
) => Promise<OsascriptCommandResult>;

export function runOsascriptCommand(
  argumentsValue: readonly string[],
  signal: AbortSignal,
): Promise<OsascriptCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(osascriptCommand, [...argumentsValue], {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let exceededOutputBound = false;
    let settled = false;
    let forceKill: NodeJS.Timeout | undefined;

    const complete = (result: OsascriptCommandResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (forceKill !== undefined) {
        clearTimeout(forceKill);
      }
      signal.removeEventListener("abort", onAbort);
      resolve(Object.freeze(result));
    };

    const onAbort = (): void => {
      child.kill("SIGTERM");
    };

    if (signal.aborted) {
      child.kill("SIGTERM");
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      forceKill = setTimeout(() => {
        child.kill("SIGKILL");
      }, 1_000);
      forceKill.unref();
    }, commandTimeoutMs);
    timeout.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maximumStatusBytes) {
        exceededOutputBound = true;
        child.kill("SIGTERM");
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", () => {
      complete({
        aborted: signal.aborted,
        exitCode: null,
        stdout: exceededOutputBound ? new Uint8Array() : Buffer.concat(chunks),
      });
    });
    child.once("exit", (exitCode) => {
      complete({
        aborted: signal.aborted,
        exitCode: exceededOutputBound ? null : exitCode,
        stdout: exceededOutputBound ? new Uint8Array() : Buffer.concat(chunks),
      });
    });
  });
}
