import type { ProviderProfileName } from "../provider-profiles.js";

export interface CredentialReader {
  readonly get: (provider: ProviderProfileName) => Promise<string | undefined>;
}

export interface CredentialStore extends CredentialReader {
  readonly delete: (provider: ProviderProfileName) => Promise<boolean>;
  readonly has: (provider: ProviderProfileName) => Promise<boolean>;
  readonly setInteractively: (provider: ProviderProfileName) => Promise<void>;
}

export type CredentialStoreErrorCode =
  "CREDENTIAL_COMMAND_FAILED" | "CREDENTIAL_INTERACTIVE_REQUIRED" | "CREDENTIAL_STORE_UNAVAILABLE";

export class CredentialStoreError extends Error {
  public readonly code: CredentialStoreErrorCode;

  public constructor(code: CredentialStoreErrorCode, message: string) {
    super(message);
    this.name = "CredentialStoreError";
    this.code = code;
  }
}
