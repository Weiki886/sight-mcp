import { z } from "zod";

export const logLevels = ["silent", "error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof logLevels)[number];

const environmentSchema = z.object({
  SIGHT_LOG_LEVEL: z.enum(logLevels).default("info"),
});

export interface AppConfig {
  readonly logLevel: LogLevel;
}

export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AppConfig {
  const result = environmentSchema.safeParse({
    SIGHT_LOG_LEVEL: environment["SIGHT_LOG_LEVEL"],
  });

  if (!result.success) {
    throw new ConfigError(`SIGHT_LOG_LEVEL must be one of: ${logLevels.join(", ")}.`);
  }

  return Object.freeze({
    logLevel: result.data.SIGHT_LOG_LEVEL,
  });
}
