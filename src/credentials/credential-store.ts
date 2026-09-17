export interface CredentialReader {
  readonly get: (account: string) => Promise<string | undefined>;
}

export interface CredentialStore extends CredentialReader {
  readonly delete: (account: string) => Promise<boolean>;
  readonly has: (account: string) => Promise<boolean>;
  readonly setInteractively: (account: string) => Promise<void>;
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
