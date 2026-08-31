import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { PACKAGE_NAME, VERSION } from "../../src/version.js";

describe("release metadata", () => {
  it("keeps package and runtime identities aligned for v0.1.0", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      readonly name?: unknown;
      readonly private?: unknown;
      readonly publishConfig?: { readonly access?: unknown; readonly provenance?: unknown };
      readonly version?: unknown;
    };

    expect(packageJson.name).toBe(PACKAGE_NAME);
    expect(packageJson.version).toBe(VERSION);
    expect(packageJson.private).toBeUndefined();
    expect(packageJson.publishConfig).toEqual({ access: "public", provenance: true });
  });
});
