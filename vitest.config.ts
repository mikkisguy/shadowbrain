import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [],
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".next"],
  },
});
