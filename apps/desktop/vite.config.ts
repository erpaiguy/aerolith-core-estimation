import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = dirname(fileURLToPath(import.meta.url));
const tauri = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_DEV_HOST);

export default defineConfig({
  plugins: [react()],
  clearScreen: !tauri,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  resolve: {
    alias: {
      "@aerolith/calc": resolve(dir, "../../packages/calc/src/index.ts"),
      "@aerolith/shared": resolve(dir, "../../packages/shared/src/index.ts"),
      "@fixtures": resolve(dir, "../../fixtures/reference"),
    },
  },
  server: {
    port: tauri ? 1420 : 5173,
    strictPort: tauri,
    open: !tauri,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: { port: 5173, strictPort: false },
  optimizeDeps: {
    include: ["sql.js/dist/sql-wasm.js"],
  },
});
