export const providerProfileNames = ["qwen", "deepseek"] as const;

export type ProviderProfileName = (typeof providerProfileNames)[number];

export interface ProviderProfile {
  readonly apiKeyEnvironmentVariable: "SIGHT_DEEPSEEK_API_KEY" | "SIGHT_QWEN_API_KEY";
  readonly baseUrl: string;
  readonly keychainAccount: ProviderProfileName;
  readonly model: string;
  readonly name: ProviderProfileName;
  readonly reasoningEffort: "low";
}

const profiles: Readonly<Record<ProviderProfileName, ProviderProfile>> = Object.freeze({
  deepseek: Object.freeze({
    apiKeyEnvironmentVariable: "SIGHT_DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com",
    keychainAccount: "deepseek",
    model: "deepseek-v4-flash-vision-exp",
    name: "deepseek",
    reasoningEffort: "low",
  }),
  qwen: Object.freeze({
    apiKeyEnvironmentVariable: "SIGHT_QWEN_API_KEY",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keychainAccount: "qwen",
    model: "qwen3.8-flash",
    name: "qwen",
    reasoningEffort: "low",
  }),
});

export function isProviderProfileName(value: string): value is ProviderProfileName {
  return providerProfileNames.some((name) => name === value);
}

export function providerProfile(name: ProviderProfileName): ProviderProfile {
  return profiles[name];
}
