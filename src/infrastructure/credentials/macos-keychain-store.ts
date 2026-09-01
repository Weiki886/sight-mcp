import { spawn } from "node:child_process";

import { CredentialStoreError, type CredentialStore } from "../../credentials/credential-store.js";
import type { ProviderProfileName } from "../../provider-profiles.js";

export const keychainService = "dev.weiki886.sight-mcp.provider-api-key";

const securityCommand = "/usr/bin/security";
const commandTimeoutMs = 15_000;
const maximumSecretBytes = 8_193;
const itemNotFoundExitCode = 44;

export interface SecurityCommandResult {
  readonly exitCode: number | null;
  readonly stdout: Uint8Array;
}

export type SecurityCommandRunner = (
  argumentsValue: readonly string[],
  options: Readonly<{ captureStdout: boolean; inheritStdio: boolean }>,
) => Promise<SecurityCommandResult>;

export interface MacOSKeychainStoreOptions {
  readonly inputIsTTY?: boolean;
  readonly outputIsTTY?: boolean;
  readonly platform?: NodeJS.Platform;
  readonly run?: SecurityCommandRunner;
  /** Dependency-injection seam for isolated Keychain validation; the CLI always uses keychainService. */
  readonly service?: string;
}

function runSecurityCommand(
  argumentsValue: readonly string[],
  options: Readonly<{ captureStdout: boolean; inheritStdio: boolean }>,
): Promise<SecurityCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(securityCommand, [...argumentsValue], {
      shell: false,
      stdio: options.inheritStdio
        ? "inherit"
        : ["ignore", options.captureStdout ? "pipe" : "ignore", "ignore"],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let exceededOutputBound = false;
    let settled = false;
    let forceKill: NodeJS.Timeout | undefined;
    const complete = (result: SecurityCommandResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (forceKill !== undefined) {
        clearTimeout(forceKill);
      }
      resolve(Object.freeze(result));
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      forceKill = setTimeout(() => {
        child.kill("SIGKILL");
      }, 1_000);
      forceKill.unref();
    }, commandTimeoutMs);
    timeout.unref();

    child.stdout?.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maximumSecretBytes) {
        exceededOutputBound = true;
        child.kill("SIGTERM");
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", () => {
      complete({ exitCode: null, stdout: new Uint8Array() });
    });
    child.once("exit", (exitCode) => {
      complete({
        exitCode: exceededOutputBound ? null : exitCode,
        stdout: exceededOutputBound ? new Uint8Array() : Buffer.concat(chunks),
      });
    });
  });
}

function unavailable(): CredentialStoreError {
  return new CredentialStoreError(
    "CREDENTIAL_STORE_UNAVAILABLE",
    "macOS Keychain credential storage is unavailable on this platform.",
  );
}

function commandFailed(): CredentialStoreError {
  return new CredentialStoreError(
    "CREDENTIAL_COMMAND_FAILED",
    "The macOS Keychain credential operation failed.",
  );
}

function findArguments(
  provider: ProviderProfileName,
  reveal: boolean,
  service: string,
): readonly string[] {
  return Object.freeze([
    "find-generic-password",
    "-a",
    provider,
    "-s",
    service,
    ...(reveal ? ["-w"] : []),
  ]);
}

export function createMacOSKeychainStore(options: MacOSKeychainStoreOptions = {}): CredentialStore {
  const platform = options.platform ?? process.platform;
  const inputIsTTY = options.inputIsTTY ?? process.stdin.isTTY;
  const outputIsTTY = options.outputIsTTY ?? process.stderr.isTTY;
  const run = options.run ?? runSecurityCommand;
  const service = options.service ?? keychainService;

  function requireMacOS(): void {
    if (platform !== "darwin") {
      throw unavailable();
    }
  }

  return Object.freeze({
    async delete(provider: ProviderProfileName): Promise<boolean> {
      requireMacOS();
      const result = await run(["delete-generic-password", "-a", provider, "-s", service], {
        captureStdout: false,
        inheritStdio: false,
      });
      if (result.exitCode === 0) {
        return true;
      }
      if (result.exitCode === itemNotFoundExitCode) {
        return false;
      }
      throw commandFailed();
    },

    async get(provider: ProviderProfileName): Promise<string | undefined> {
      requireMacOS();
      const result = await run(findArguments(provider, true, service), {
        captureStdout: true,
        inheritStdio: false,
      });
      if (result.exitCode === itemNotFoundExitCode) {
        return undefined;
      }
      if (result.exitCode !== 0) {
        throw commandFailed();
      }
      return Buffer.from(result.stdout)
        .toString("utf8")
        .replace(/\r?\n$/u, "");
    },

    async has(provider: ProviderProfileName): Promise<boolean> {
      requireMacOS();
      const result = await run(findArguments(provider, false, service), {
        captureStdout: false,
        inheritStdio: false,
      });
      if (result.exitCode === 0) {
        return true;
      }
      if (result.exitCode === itemNotFoundExitCode) {
        return false;
      }
      throw commandFailed();
    },

    async setInteractively(provider: ProviderProfileName): Promise<void> {
      requireMacOS();
      if (!inputIsTTY || !outputIsTTY) {
        throw new CredentialStoreError(
          "CREDENTIAL_INTERACTIVE_REQUIRED",
          "Setting a macOS Keychain credential requires an interactive terminal.",
        );
      }
      const result = await run(
        [
          "add-generic-password",
          "-a",
          provider,
          "-s",
          service,
          "-l",
          `Sight MCP ${provider} Provider API key`,
          "-U",
          "-w",
        ],
        { captureStdout: false, inheritStdio: true },
      );
      if (result.exitCode !== 0) {
        throw commandFailed();
      }
    },
  });
}
