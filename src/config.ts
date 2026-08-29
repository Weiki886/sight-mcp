import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
  delimiter as platformDelimiter,
  isAbsolute,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";

import { z } from "zod";

export const logLevels = ["silent", "error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof logLevels)[number];
export type ConfigWarning = "BROAD_ALLOWED_ROOT";

export const imageConfigDefaults = Object.freeze({
  jpegQuality: 85,
  maxImageBytes: 20_971_520,
  maxImageDimension: 12_000,
  maxImagePixels: 40_000_000,
  maxTransmitBytes: 10_485_760,
  transmitMaxDimension: 2_048,
});

export interface ImageConfig {
  readonly allowedRoots: readonly string[];
  readonly jpegQuality: number;
  readonly maxImageBytes: number;
  readonly maxImageDimension: number;
  readonly maxImagePixels: number;
  readonly maxTransmitBytes: number;
  readonly transmitMaxDimension: number;
}

export interface AppConfig {
  readonly image: ImageConfig;
  readonly logLevel: LogLevel;
  readonly warnings: readonly ConfigWarning[];
}

export interface ConfigLoadOptions {
  readonly cwd?: string;
  readonly pathDelimiter?: string;
}

export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function integerString(defaultValue: number, minimum: number, maximum: number) {
  return z
    .string()
    .regex(/^\d+$/u)
    .default(String(defaultValue))
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));
}

const environmentSchema = z.object({
  SIGHT_ALLOWED_ROOTS: z.string().optional(),
  SIGHT_JPEG_QUALITY: integerString(imageConfigDefaults.jpegQuality, 40, 95),
  SIGHT_LOG_LEVEL: z.enum(logLevels).default("info"),
  SIGHT_MAX_IMAGE_BYTES: integerString(imageConfigDefaults.maxImageBytes, 1, 104_857_600),
  SIGHT_MAX_IMAGE_DIMENSION: integerString(imageConfigDefaults.maxImageDimension, 1, 32_768),
  SIGHT_MAX_IMAGE_PIXELS: integerString(imageConfigDefaults.maxImagePixels, 1, 100_000_000),
  SIGHT_MAX_TRANSMIT_BYTES: integerString(imageConfigDefaults.maxTransmitBytes, 1_024, 104_857_600),
  SIGHT_TRANSMIT_MAX_DIMENSION: integerString(imageConfigDefaults.transmitMaxDimension, 64, 32_768),
});

function isWithinRoot(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

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

async function canonicalizeRoots(
  configuredValue: string | undefined,
  cwd: string,
  pathDelimiter: string,
): Promise<readonly string[]> {
  const rootValues =
    configuredValue === undefined || configuredValue === ""
      ? [cwd]
      : configuredValue.split(pathDelimiter);

  if (rootValues.some((root) => root.length === 0 || !isAbsolute(root))) {
    throw new ConfigError("SIGHT_ALLOWED_ROOTS must contain existing absolute directories.");
  }

  const canonicalRoots: string[] = [];
  for (const root of rootValues) {
    try {
      const canonicalRoot = await realpath(root);
      const rootStatus = await stat(canonicalRoot);
      if (!rootStatus.isDirectory()) {
        throw new ConfigError("SIGHT_ALLOWED_ROOTS must contain existing absolute directories.");
      }
      canonicalRoots.push(canonicalRoot);
    } catch (error: unknown) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError("SIGHT_ALLOWED_ROOTS must contain existing absolute directories.");
    }
  }

  return collapseNestedRoots(canonicalRoots);
}

async function hasBroadRoot(roots: readonly string[]): Promise<boolean> {
  let canonicalHome: string | undefined;
  try {
    canonicalHome = await realpath(homedir());
  } catch {
    canonicalHome = undefined;
  }

  return roots.some((root) => root === parse(root).root || root === canonicalHome);
}

function configurationError(result: z.ZodError): ConfigError {
  const firstPathSegment = result.issues[0]?.path[0];
  const variableName =
    typeof firstPathSegment === "string" && firstPathSegment.startsWith("SIGHT_")
      ? firstPathSegment
      : "Sight MCP configuration";
  return new ConfigError(`${variableName} is invalid.`);
}

export async function loadConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: ConfigLoadOptions = {},
): Promise<AppConfig> {
  const result = environmentSchema.safeParse({
    SIGHT_ALLOWED_ROOTS: environment["SIGHT_ALLOWED_ROOTS"],
    SIGHT_JPEG_QUALITY: environment["SIGHT_JPEG_QUALITY"],
    SIGHT_LOG_LEVEL: environment["SIGHT_LOG_LEVEL"],
    SIGHT_MAX_IMAGE_BYTES: environment["SIGHT_MAX_IMAGE_BYTES"],
    SIGHT_MAX_IMAGE_DIMENSION: environment["SIGHT_MAX_IMAGE_DIMENSION"],
    SIGHT_MAX_IMAGE_PIXELS: environment["SIGHT_MAX_IMAGE_PIXELS"],
    SIGHT_MAX_TRANSMIT_BYTES: environment["SIGHT_MAX_TRANSMIT_BYTES"],
    SIGHT_TRANSMIT_MAX_DIMENSION: environment["SIGHT_TRANSMIT_MAX_DIMENSION"],
  });

  if (!result.success) {
    throw configurationError(result.error);
  }

  const {
    SIGHT_JPEG_QUALITY: jpegQuality,
    SIGHT_MAX_IMAGE_BYTES: maxImageBytes,
    SIGHT_MAX_IMAGE_DIMENSION: maxImageDimension,
    SIGHT_MAX_IMAGE_PIXELS: maxImagePixels,
    SIGHT_MAX_TRANSMIT_BYTES: maxTransmitBytes,
    SIGHT_TRANSMIT_MAX_DIMENSION: transmitMaxDimension,
  } = result.data;

  if (transmitMaxDimension > maxImageDimension) {
    throw new ConfigError(
      "SIGHT_TRANSMIT_MAX_DIMENSION must not exceed SIGHT_MAX_IMAGE_DIMENSION.",
    );
  }
  if (maxTransmitBytes > maxImageBytes) {
    throw new ConfigError("SIGHT_MAX_TRANSMIT_BYTES must not exceed SIGHT_MAX_IMAGE_BYTES.");
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const allowedRoots = await canonicalizeRoots(
    result.data.SIGHT_ALLOWED_ROOTS,
    cwd,
    options.pathDelimiter ?? platformDelimiter,
  );
  const warnings: ConfigWarning[] = (await hasBroadRoot(allowedRoots))
    ? ["BROAD_ALLOWED_ROOT"]
    : [];

  const image: ImageConfig = Object.freeze({
    allowedRoots,
    jpegQuality,
    maxImageBytes,
    maxImageDimension,
    maxImagePixels,
    maxTransmitBytes,
    transmitMaxDimension,
  });

  return Object.freeze({
    image,
    logLevel: result.data.SIGHT_LOG_LEVEL,
    warnings: Object.freeze(warnings),
  });
}
