import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@aerolith/calc": resolve(dir, "../../packages/calc/src/index.ts"),
      "@aerolith/shared": resolve(dir, "../../packages/shared/src/index.ts"),
      "@fixtures": resolve(dir, "../../fixtures/reference"),
    },
  },
});
