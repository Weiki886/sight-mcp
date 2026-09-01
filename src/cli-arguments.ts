import { isProviderProfileName, type ProviderProfileName } from "./provider-profiles.js";

export type CliCommand =
  | Readonly<{ kind: "serve"; provider?: ProviderProfileName }>
  | Readonly<{
      action: "delete";
      assumeYes: boolean;
      kind: "credentials";
      provider: ProviderProfileName;
    }>
  | Readonly<{
      action: "set";
      kind: "credentials";
      provider: ProviderProfileName;
    }>
  | Readonly<{
      action: "status";
      kind: "credentials";
      provider?: ProviderProfileName;
    }>;

export class CliUsageError extends Error {
  public constructor() {
    super(
      "Usage: sight-mcp [--provider <qwen|deepseek>] | credentials <set|status|delete> [qwen|deepseek] [--yes]",
    );
    this.name = "CliUsageError";
  }
}

function requiredProvider(value: string | undefined): ProviderProfileName {
  if (value === undefined || !isProviderProfileName(value)) {
    throw new CliUsageError();
  }
  return value;
}

export function parseCliArguments(argumentsValue: readonly string[]): CliCommand {
  if (argumentsValue.length === 0) {
    return Object.freeze({ kind: "serve" });
  }
  if (argumentsValue.length === 2 && argumentsValue[0] === "--provider") {
    return Object.freeze({ kind: "serve", provider: requiredProvider(argumentsValue[1]) });
  }
  if (argumentsValue[0] !== "credentials") {
    throw new CliUsageError();
  }

  const action = argumentsValue[1];
  if (action === "set" && argumentsValue.length === 3) {
    return Object.freeze({
      action,
      kind: "credentials",
      provider: requiredProvider(argumentsValue[2]),
    });
  }
  if (action === "status" && argumentsValue.length === 2) {
    return Object.freeze({ action, kind: "credentials" });
  }
  if (action === "status" && argumentsValue.length === 3) {
    return Object.freeze({
      action,
      kind: "credentials",
      provider: requiredProvider(argumentsValue[2]),
    });
  }
  if (action === "delete" && (argumentsValue.length === 3 || argumentsValue.length === 4)) {
    const assumeYes = argumentsValue.length === 4 && argumentsValue[3] === "--yes";
    if (argumentsValue.length === 4 && !assumeYes) {
      throw new CliUsageError();
    }
    return Object.freeze({
      action,
      assumeYes,
      kind: "credentials",
      provider: requiredProvider(argumentsValue[2]),
    });
  }
  throw new CliUsageError();
}
