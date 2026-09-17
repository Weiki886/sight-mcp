export type CliCommand =
  | Readonly<{ kind: "serve" }>
  | Readonly<{
      account: string;
      action: "delete";
      assumeYes: boolean;
      kind: "credentials";
    }>
  | Readonly<{
      account: string;
      action: "set";
      kind: "credentials";
    }>
  | Readonly<{
      account: string;
      action: "status";
      kind: "credentials";
    }>;

const usageMessage = "Usage: sight-mcp | credentials <set|status|delete> <account> [--yes]";

export class CliUsageError extends Error {
  public constructor(message: string = usageMessage) {
    super(message);
    this.name = "CliUsageError";
  }
}

const accountPattern = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/u;

function requiredAccount(value: string | undefined): string {
  if (value === undefined || !accountPattern.test(value)) {
    throw new CliUsageError();
  }
  return value;
}

export function parseCliArguments(argumentsValue: readonly string[]): CliCommand {
  if (argumentsValue.length === 0) {
    return Object.freeze({ kind: "serve" });
  }
  if (argumentsValue[0] === "--provider") {
    throw new CliUsageError(
      "The --provider flag was removed. Configure SIGHT_PROVIDER_BASE_URL and SIGHT_PROVIDER_MODEL for your vision model instead.",
    );
  }
  if (argumentsValue[0] !== "credentials") {
    throw new CliUsageError();
  }

  const action = argumentsValue[1];
  if (action === "set" && argumentsValue.length === 3) {
    return Object.freeze({
      account: requiredAccount(argumentsValue[2]),
      action,
      kind: "credentials",
    });
  }
  if (action === "status" && argumentsValue.length === 3) {
    return Object.freeze({
      account: requiredAccount(argumentsValue[2]),
      action,
      kind: "credentials",
    });
  }
  if (action === "delete" && (argumentsValue.length === 3 || argumentsValue.length === 4)) {
    const assumeYes = argumentsValue.length === 4 && argumentsValue[3] === "--yes";
    if (argumentsValue.length === 4 && !assumeYes) {
      throw new CliUsageError();
    }
    return Object.freeze({
      account: requiredAccount(argumentsValue[2]),
      action,
      assumeYes,
      kind: "credentials",
    });
  }
  throw new CliUsageError();
}
