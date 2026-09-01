import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ConfigError,
  executionConfigDefaults,
  imageConfigDefaults,
  loadConfig,
  providerConfigDefaults,
  revealProviderApiKey,
} from "../../src/config.js";

const temporaryDirectories: string[] = [];
const requiredProviderEnvironment = Object.freeze({
  SIGHT_PROVIDER_BASE_URL: "http://127.0.0.1:11434/v1",
  SIGHT_PROVIDER_MODEL: "test-vision-model",
});

function environment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> {
  return { ...requiredProviderEnvironment, ...overrides };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sight-mcp-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("loadConfig", () => {
  it("uses the canonical working directory and documented safe defaults", async () => {
    const directory = await temporaryDirectory();

    await expect(loadConfig(environment(), { cwd: directory })).resolves.toEqual({
      execution: executionConfigDefaults,
      image: {
        allowedRoots: [await realpath(directory)],
        ...imageConfigDefaults,
      },
      logLevel: "info",
      provider: {
        baseUrl: "http://127.0.0.1:11434/v1",
        completionUrl: "http://127.0.0.1:11434/v1/chat/completions",
        model: "test-vision-model",
        ...providerConfigDefaults,
      },
      warnings: [],
    });
  });

  it("returns an immutable typed configuration", async () => {
    const directory = await temporaryDirectory();
    const config = await loadConfig(environment({ SIGHT_LOG_LEVEL: "debug" }), {
      cwd: directory,
    });

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.execution)).toBe(true);
    expect(Object.isFrozen(config.image)).toBe(true);
    expect(Object.isFrozen(config.image.allowedRoots)).toBe(true);
    expect(Object.isFrozen(config.provider)).toBe(true);
    expect(Object.isFrozen(config.warnings)).toBe(true);
  });

  it("canonicalizes, deduplicates, and collapses nested allowed roots", async () => {
    const directory = await temporaryDirectory();
    const nested = join(directory, "nested");
    await mkdir(nested);

    const config = await loadConfig(
      environment({ SIGHT_ALLOWED_ROOTS: `${nested};${directory};${nested}` }),
      { cwd: directory, pathDelimiter: ";" },
    );

    expect(config.image.allowedRoots).toEqual([await realpath(directory)]);
  });

  it("rejects relative, missing, and non-directory roots without exposing their values", async () => {
    const directory = await temporaryDirectory();
    const canary = join(directory, "private-canary");
    await writeFile(canary, "secret");

    for (const value of ["relative-secret", join(directory, "missing-secret"), canary]) {
      let received: unknown;
      try {
        await loadConfig(environment({ SIGHT_ALLOWED_ROOTS: value }), { cwd: directory });
      } catch (error: unknown) {
        received = error;
      }

      expect(received).toBeInstanceOf(ConfigError);
      expect(String(received)).not.toContain(value);
    }
  });

  it("rejects invalid values and cross-field limits without echoing input", async () => {
    const directory = await temporaryDirectory();
    const secretValue = "secret-value-that-must-not-be-logged";

    await expect(
      loadConfig(environment({ SIGHT_LOG_LEVEL: secretValue }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_LOG_LEVEL is invalid.");
    await expect(
      loadConfig(environment({ SIGHT_MAX_IMAGE_BYTES: "0" }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_MAX_IMAGE_BYTES is invalid.");
    await expect(
      loadConfig(environment({ SIGHT_MAX_IMAGE_BYTES: "2048", SIGHT_MAX_TRANSMIT_BYTES: "4096" }), {
        cwd: directory,
      }),
    ).rejects.toThrow("SIGHT_MAX_TRANSMIT_BYTES must not exceed SIGHT_MAX_IMAGE_BYTES.");

    try {
      await loadConfig(environment({ SIGHT_LOG_LEVEL: secretValue }), { cwd: directory });
    } catch (error: unknown) {
      expect(String(error)).not.toContain(secretValue);
    }
  });

  it("warns when the filesystem root is allowed", async () => {
    const directory = await temporaryDirectory();
    const filesystemRoot = parse(directory).root;

    const config = await loadConfig(environment({ SIGHT_ALLOWED_ROOTS: filesystemRoot }), {
      cwd: directory,
    });

    expect(config.warnings).toEqual(["BROAD_ALLOWED_ROOT"]);
  });

  it("requires provider URL and model with redacted startup failures", async () => {
    const directory = await temporaryDirectory();

    await expect(loadConfig({ SIGHT_PROVIDER_MODEL: "model" }, { cwd: directory })).rejects.toThrow(
      "SIGHT_PROVIDER_BASE_URL is invalid.",
    );
    await expect(
      loadConfig({ SIGHT_PROVIDER_BASE_URL: "https://provider.example/v1" }, { cwd: directory }),
    ).rejects.toThrow("SIGHT_PROVIDER_MODEL is invalid.");
  });

  it.each([
    "http://provider.example/v1",
    "ftp://provider.example/v1",
    "https://user:password@provider.example/v1",
    "https://provider.example/v1?secret=query",
    "https://provider.example/v1#fragment",
    "https://provider.example/v1/chat/completions",
    "https://provider.example/chat%2Fcompletions",
    "http://localhost.example/v1",
  ])("rejects unsafe provider URL %s without echoing it", async (baseUrl) => {
    const directory = await temporaryDirectory();
    let received: unknown;

    try {
      await loadConfig(environment({ SIGHT_PROVIDER_BASE_URL: baseUrl }), { cwd: directory });
    } catch (error: unknown) {
      received = error;
    }

    expect(received).toBeInstanceOf(ConfigError);
    expect(String(received)).not.toContain(baseUrl);
  });

  it.each([
    ["https://provider.example/v1/", "https://provider.example/v1/chat/completions"],
    ["http://localhost:1234/v1", "http://localhost:1234/v1/chat/completions"],
    ["http://127.255.1.2:1234/v1", "http://127.255.1.2:1234/v1/chat/completions"],
    ["http://[::1]:1234/v1", "http://[::1]:1234/v1/chat/completions"],
  ])("accepts provider root %s", async (baseUrl, completionUrl) => {
    const directory = await temporaryDirectory();
    const config = await loadConfig(environment({ SIGHT_PROVIDER_BASE_URL: baseUrl }), {
      cwd: directory,
    });

    expect(config.provider.completionUrl).toBe(completionUrl);
  });

  it("keeps an optional API key behind a redacted wrapper", async () => {
    const directory = await temporaryDirectory();
    const secret = "provider-key-private-canary";
    const config = await loadConfig(environment({ SIGHT_PROVIDER_API_KEY: secret }), {
      cwd: directory,
    });

    expect(config.provider.apiKey?.toString()).toBe("[REDACTED]");
    expect(JSON.stringify(config)).not.toContain(secret);
    expect(config.provider.apiKey).toBeDefined();
    if (config.provider.apiKey !== undefined) {
      expect(revealProviderApiKey(config.provider.apiKey)).toBe(secret);
    }
  });

  it.each([
    [
      "qwen" as const,
      "SIGHT_QWEN_API_KEY",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "qwen3.8-flash",
    ],
    [
      "deepseek" as const,
      "SIGHT_DEEPSEEK_API_KEY",
      "https://api.deepseek.com",
      "deepseek-v4-flash-vision-exp",
    ],
  ])(
    "loads the fixed %s profile and its provider-specific environment credential",
    async (profile, variableName, baseUrl, model) => {
      const directory = await temporaryDirectory();
      const profileKey = `${profile}-profile-private-key`;
      const config = await loadConfig(
        {
          [variableName]: profileKey,
          SIGHT_PROVIDER_BASE_URL: "https://ignored-provider.example/v1",
          SIGHT_PROVIDER_MODEL: "ignored-model",
        },
        { cwd: directory, providerProfile: profile },
      );

      expect(config.provider).toMatchObject({ baseUrl, model, reasoningEffort: "low" });
      expect(config.provider.apiKey).toBeDefined();
      if (config.provider.apiKey !== undefined) {
        expect(revealProviderApiKey(config.provider.apiKey)).toBe(profileKey);
      }
    },
  );

  it("resolves profile credentials in explicit generic, selected environment, Keychain order", async () => {
    const directory = await temporaryDirectory();
    const requestedAccounts: string[] = [];
    const credentialReader = {
      get: (provider: "qwen" | "deepseek") => {
        requestedAccounts.push(provider);
        return Promise.resolve("keychain-private-key");
      },
    };

    const generic = await loadConfig(
      {
        SIGHT_PROVIDER_API_KEY: "generic-private-key",
        SIGHT_QWEN_API_KEY: "qwen-environment-private-key",
      },
      { credentialReader, cwd: directory, providerProfile: "qwen" },
    );
    if (generic.provider.apiKey !== undefined) {
      expect(revealProviderApiKey(generic.provider.apiKey)).toBe("generic-private-key");
    }
    expect(requestedAccounts).toEqual([]);

    const selectedEnvironment = await loadConfig(
      { SIGHT_QWEN_API_KEY: "qwen-environment-private-key" },
      { credentialReader, cwd: directory, providerProfile: "qwen" },
    );
    if (selectedEnvironment.provider.apiKey !== undefined) {
      expect(revealProviderApiKey(selectedEnvironment.provider.apiKey)).toBe(
        "qwen-environment-private-key",
      );
    }
    expect(requestedAccounts).toEqual([]);

    const keychain = await loadConfig(
      { SIGHT_DEEPSEEK_API_KEY: "unselected-private-key" },
      { credentialReader, cwd: directory, providerProfile: "qwen" },
    );
    if (keychain.provider.apiKey !== undefined) {
      expect(revealProviderApiKey(keychain.provider.apiKey)).toBe("keychain-private-key");
    }
    expect(requestedAccounts).toEqual(["qwen"]);
  });

  it("allows an explicit effort override for a built-in profile", async () => {
    const directory = await temporaryDirectory();
    await expect(
      loadConfig(
        { SIGHT_PROVIDER_API_KEY: "private-key", SIGHT_PROVIDER_REASONING_EFFORT: "medium" },
        { cwd: directory, providerProfile: "qwen" },
      ),
    ).resolves.toMatchObject({ provider: { reasoningEffort: "medium" } });
  });

  it("fails with sanitized profile credential errors", async () => {
    const directory = await temporaryDirectory();
    await expect(loadConfig({}, { cwd: directory, providerProfile: "qwen" })).rejects.toThrow(
      "qwen provider credential is not configured. Run sight-mcp credentials set qwen.",
    );
    await expect(
      loadConfig(
        { SIGHT_QWEN_API_KEY: "private invalid key with spaces" },
        { cwd: directory, providerProfile: "qwen" },
      ),
    ).rejects.toThrow("SIGHT_QWEN_API_KEY is invalid.");
    await expect(
      loadConfig(
        {},
        {
          credentialReader: {
            get: () => Promise.reject(new Error("private-keychain-diagnostic")),
          },
          cwd: directory,
          providerProfile: "deepseek",
        },
      ),
    ).rejects.toThrow("macOS Keychain credential lookup failed.");
  });

  it.each(["low", "medium", "high", "xhigh", "max"] as const)(
    "accepts provider reasoning effort %s",
    async (reasoningEffort) => {
      const directory = await temporaryDirectory();

      await expect(
        loadConfig(environment({ SIGHT_PROVIDER_REASONING_EFFORT: reasoningEffort }), {
          cwd: directory,
        }),
      ).resolves.toMatchObject({ provider: { reasoningEffort } });
    },
  );

  it("rejects an invalid provider reasoning effort without echoing it", async () => {
    const directory = await temporaryDirectory();
    const invalidEffort = "private-invalid-effort-canary";
    let received: unknown;

    try {
      await loadConfig(environment({ SIGHT_PROVIDER_REASONING_EFFORT: invalidEffort }), {
        cwd: directory,
      });
    } catch (error: unknown) {
      received = error;
    }

    expect(received).toBeInstanceOf(ConfigError);
    expect(String(received)).toContain("SIGHT_PROVIDER_REASONING_EFFORT is invalid.");
    expect(String(received)).not.toContain(invalidEffort);
  });

  it("validates provider resource limits", async () => {
    const directory = await temporaryDirectory();

    await expect(
      loadConfig(environment({ SIGHT_MAX_RETRIES: "6" }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_MAX_RETRIES is invalid.");
    await expect(
      loadConfig(environment({ SIGHT_REQUEST_TIMEOUT_MS: "999" }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_REQUEST_TIMEOUT_MS is invalid.");
    await expect(
      loadConfig(environment({ SIGHT_MAX_PROVIDER_RESPONSE_BYTES: "1023" }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_MAX_PROVIDER_RESPONSE_BYTES is invalid.");
    await expect(
      loadConfig(environment({ SIGHT_MAX_OUTPUT_CHARS: "255" }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_MAX_OUTPUT_CHARS is invalid.");
  });

  it("validates bounded concurrency and queue settings", async () => {
    const directory = await temporaryDirectory();

    await expect(
      loadConfig(environment({ SIGHT_MAX_CONCURRENCY: "0" }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_MAX_CONCURRENCY is invalid.");
    await expect(
      loadConfig(environment({ SIGHT_MAX_QUEUE_SIZE: "129" }), { cwd: directory }),
    ).rejects.toThrow("SIGHT_MAX_QUEUE_SIZE is invalid.");

    await expect(
      loadConfig(environment({ SIGHT_MAX_CONCURRENCY: "4", SIGHT_MAX_QUEUE_SIZE: "0" }), {
        cwd: directory,
      }),
    ).resolves.toMatchObject({ execution: { maxConcurrency: 4, maxQueueSize: 0 } });
  });
});
