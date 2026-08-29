import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    environment: "node",
    passWithNoTests: false,
    restoreMocks: true,
  },
});
