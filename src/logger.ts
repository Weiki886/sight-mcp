import type { Writable } from "node:stream";

import type { LogLevel } from "./config.js";

export type LogValue = boolean | number | string | null;
export type LogContext = Readonly<Record<string, LogValue>>;

export interface Logger {
  readonly debug: (message: string, context?: LogContext) => void;
  readonly error: (message: string, context?: LogContext) => void;
  readonly info: (message: string, context?: LogContext) => void;
  readonly warn: (message: string, context?: LogContext) => void;
}

interface LoggerOptions {
  readonly clock?: () => Date;
  readonly destination?: Pick<Writable, "write">;
}

const levelPriority: Readonly<Record<LogLevel, number>> = Object.freeze({
  silent: Number.POSITIVE_INFINITY,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
});

export function createLogger(level: LogLevel, options: LoggerOptions = {}): Logger {
  const destination = options.destination ?? process.stderr;
  const clock = options.clock ?? (() => new Date());

  const write = (
    entryLevel: Exclude<LogLevel, "silent">,
    message: string,
    context?: LogContext,
  ) => {
    if (level === "silent" || levelPriority[entryLevel] > levelPriority[level]) {
      return;
    }

    const entry = {
      timestamp: clock().toISOString(),
      level: entryLevel,
      message,
      ...(context === undefined ? {} : { context }),
    };

    destination.write(`${JSON.stringify(entry)}\n`);
  };

  return Object.freeze({
    debug: (message: string, context?: LogContext) => {
      write("debug", message, context);
    },
    error: (message: string, context?: LogContext) => {
      write("error", message, context);
    },
    info: (message: string, context?: LogContext) => {
      write("info", message, context);
    },
    warn: (message: string, context?: LogContext) => {
      write("warn", message, context);
    },
  });
}
