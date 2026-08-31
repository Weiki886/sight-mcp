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
export const providerReasoningEfforts = ["low", "medium", "high", "xhigh", "max"] as const;

export type LogLevel = (typeof logLevels)[number];
export type ProviderReasoningEffort = (typeof providerReasoningEfforts)[number];
export type ConfigWarning = "BROAD_ALLOWED_ROOT";

export const imageConfigDefaults = Object.freeze({
  jpegQuality: 85,
  maxImageBytes: 20_971_520,
  maxImageDimension: 12_000,
  maxImagePixels: 40_000_000,
  maxTransmitBytes: 10_485_760,
  transmitMaxDimension: 2_048,
});

export const providerConfigDefaults = Object.freeze({
  maxOutputChars: 32_000,
  maxResponseBytes: 1_048_576,
  maxRetries: 2,
  maxTokens: 4_096,
  requestTimeoutMs: 60_000,
});

export const executionConfigDefaults = Object.freeze({
  maxConcurrency: 2,
  maxQueueSize: 8,
});

const providerApiKeyBrand: unique symbol = Symbol("ProviderApiKey");

export interface ProviderApiKey {
  readonly [providerApiKeyBrand]: true;
  readonly redacted: "[REDACTED]";
  readonly toJSON: () => "[REDACTED]";
  readonly toString: () => "[REDACTED]";
}

export interface ProviderConfig {
  readonly apiKey?: ProviderApiKey;
  readonly baseUrl: string;
  readonly completionUrl: string;
  readonly maxOutputChars: number;
  readonly maxResponseBytes: number;
  readonly maxRetries: number;
  readonly maxTokens: number;
  readonly model: string;
  readonly reasoningEffort?: ProviderReasoningEffort;
  readonly requestTimeoutMs: number;
}

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
  readonly execution: ExecutionConfig;
  readonly image: ImageConfig;
  readonly logLevel: LogLevel;
  readonly provider: ProviderConfig;
  readonly warnings: readonly ConfigWarning[];
}

export interface ExecutionConfig {
  readonly maxConcurrency: number;
  readonly maxQueueSize: number;
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
  SIGHT_MAX_CONCURRENCY: integerString(executionConfigDefaults.maxConcurrency, 1, 16),
  SIGHT_MAX_IMAGE_BYTES: integerString(imageConfigDefaults.maxImageBytes, 1, 104_857_600),
  SIGHT_MAX_IMAGE_DIMENSION: integerString(imageConfigDefaults.maxImageDimension, 1, 32_768),
  SIGHT_MAX_IMAGE_PIXELS: integerString(imageConfigDefaults.maxImagePixels, 1, 100_000_000),
  SIGHT_MAX_TRANSMIT_BYTES: integerString(imageConfigDefaults.maxTransmitBytes, 1_024, 104_857_600),
  SIGHT_MAX_OUTPUT_CHARS: integerString(providerConfigDefaults.maxOutputChars, 256, 200_000),
  SIGHT_MAX_PROVIDER_RESPONSE_BYTES: integerString(
    providerConfigDefaults.maxResponseBytes,
    1_024,
    10_485_760,
  ),
  SIGHT_MAX_QUEUE_SIZE: integerString(executionConfigDefaults.maxQueueSize, 0, 128),
  SIGHT_MAX_RETRIES: integerString(providerConfigDefaults.maxRetries, 0, 5),
  SIGHT_PROVIDER_API_KEY: z.string().optional(),
  SIGHT_PROVIDER_BASE_URL: z.string(),
  SIGHT_PROVIDER_MAX_TOKENS: integerString(providerConfigDefaults.maxTokens, 1, 32_768),
  SIGHT_PROVIDER_MODEL: z.string().min(1).max(256),
  SIGHT_PROVIDER_REASONING_EFFORT: z.enum(providerReasoningEfforts).optional(),
  SIGHT_REQUEST_TIMEOUT_MS: integerString(providerConfigDefaults.requestTimeoutMs, 1_000, 300_000),
  SIGHT_TRANSMIT_MAX_DIMENSION: integerString(imageConfigDefaults.transmitMaxDimension, 64, 32_768),
});

const providerApiKeys = new WeakMap<ProviderApiKey, string>();

function createProviderApiKey(value: string): ProviderApiKey {
  const apiKey: ProviderApiKey = {
    [providerApiKeyBrand]: true,
    redacted: "[REDACTED]",
    toJSON: (): "[REDACTED]" => "[REDACTED]",
    toString: (): "[REDACTED]" => "[REDACTED]",
  };
  Object.freeze(apiKey);
  providerApiKeys.set(apiKey, value);
  return apiKey;
}

export function revealProviderApiKey(apiKey: ProviderApiKey): string {
  const value = providerApiKeys.get(apiKey);
  if (value === undefined) {
    throw new ConfigError("SIGHT_PROVIDER_API_KEY is invalid.");
  }
  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  const unwrappedHostname =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (unwrappedHostname === "localhost" || unwrappedHostname === "::1") {
    return true;
  }

  const octets = unwrappedHostname.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255)
  );
}

function normalizeProviderUrls(
  value: string,
): Readonly<{ baseUrl: string; completionUrl: string }> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError("SIGHT_PROVIDER_BASE_URL is invalid.");
  }

  if (
    value.trim() !== value ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    value.includes("?") ||
    value.includes("#") ||
    /%2f|%5c/iu.test(url.pathname)
  ) {
    throw new ConfigError("SIGHT_PROVIDER_BASE_URL is invalid.");
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new ConfigError("SIGHT_PROVIDER_BASE_URL is invalid.");
  }

  const pathSegments = url.pathname.toLowerCase().split("/").filter(Boolean);
  if (
    pathSegments.some(
      (segment, index) => segment === "chat" && pathSegments[index + 1] === "completions",
    )
  ) {
    throw new ConfigError("SIGHT_PROVIDER_BASE_URL is invalid.");
  }

  const normalizedPath = url.pathname.replace(/\/+$/u, "");
  const baseUrl = `${url.origin}${normalizedPath}`;
  return Object.freeze({ baseUrl, completionUrl: `${baseUrl}/chat/completions` });
}

function providerApiKey(value: string | undefined): ProviderApiKey | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value.length > 8_192 || !isPrintableAsciiToken(value)) {
    throw new ConfigError("SIGHT_PROVIDER_API_KEY is invalid.");
  }
  return createProviderApiKey(value);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function isPrintableAsciiToken(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 33 || code > 126) {
      return false;
    }
  }
  return true;
}

function providerModel(value: string): string {
  if (value.trim().length === 0 || hasControlCharacter(value)) {
    throw new ConfigError("SIGHT_PROVIDER_MODEL is invalid.");
  }
  return value;
}

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
    SIGHT_MAX_CONCURRENCY: environment["SIGHT_MAX_CONCURRENCY"],
    SIGHT_MAX_IMAGE_BYTES: environment["SIGHT_MAX_IMAGE_BYTES"],
    SIGHT_MAX_IMAGE_DIMENSION: environment["SIGHT_MAX_IMAGE_DIMENSION"],
    SIGHT_MAX_IMAGE_PIXELS: environment["SIGHT_MAX_IMAGE_PIXELS"],
    SIGHT_MAX_OUTPUT_CHARS: environment["SIGHT_MAX_OUTPUT_CHARS"],
    SIGHT_MAX_PROVIDER_RESPONSE_BYTES: environment["SIGHT_MAX_PROVIDER_RESPONSE_BYTES"],
    SIGHT_MAX_QUEUE_SIZE: environment["SIGHT_MAX_QUEUE_SIZE"],
    SIGHT_MAX_RETRIES: environment["SIGHT_MAX_RETRIES"],
    SIGHT_MAX_TRANSMIT_BYTES: environment["SIGHT_MAX_TRANSMIT_BYTES"],
    SIGHT_PROVIDER_API_KEY: environment["SIGHT_PROVIDER_API_KEY"],
    SIGHT_PROVIDER_BASE_URL: environment["SIGHT_PROVIDER_BASE_URL"],
    SIGHT_PROVIDER_MAX_TOKENS: environment["SIGHT_PROVIDER_MAX_TOKENS"],
    SIGHT_PROVIDER_MODEL: environment["SIGHT_PROVIDER_MODEL"],
    SIGHT_PROVIDER_REASONING_EFFORT: environment["SIGHT_PROVIDER_REASONING_EFFORT"],
    SIGHT_REQUEST_TIMEOUT_MS: environment["SIGHT_REQUEST_TIMEOUT_MS"],
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
    SIGHT_MAX_CONCURRENCY: maxConcurrency,
    SIGHT_MAX_OUTPUT_CHARS: maxOutputChars,
    SIGHT_MAX_PROVIDER_RESPONSE_BYTES: maxResponseBytes,
    SIGHT_MAX_QUEUE_SIZE: maxQueueSize,
    SIGHT_MAX_RETRIES: maxRetries,
    SIGHT_MAX_TRANSMIT_BYTES: maxTransmitBytes,
    SIGHT_PROVIDER_MAX_TOKENS: maxTokens,
    SIGHT_REQUEST_TIMEOUT_MS: requestTimeoutMs,
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
  const execution: ExecutionConfig = Object.freeze({ maxConcurrency, maxQueueSize });
  const providerUrls = normalizeProviderUrls(result.data.SIGHT_PROVIDER_BASE_URL);
  const apiKey = providerApiKey(result.data.SIGHT_PROVIDER_API_KEY);
  const provider: ProviderConfig = Object.freeze({
    ...(apiKey === undefined ? {} : { apiKey }),
    ...providerUrls,
    maxOutputChars,
    maxResponseBytes,
    maxRetries,
    maxTokens,
    model: providerModel(result.data.SIGHT_PROVIDER_MODEL),
    ...(result.data.SIGHT_PROVIDER_REASONING_EFFORT === undefined
      ? {}
      : { reasoningEffort: result.data.SIGHT_PROVIDER_REASONING_EFFORT }),
    requestTimeoutMs,
  });

  return Object.freeze({
    execution,
    image,
    logLevel: result.data.SIGHT_LOG_LEVEL,
    provider,
    warnings: Object.freeze(warnings),
  });
}
