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
    env: {
      NODE_ENV: "test",
      SESSION_SECRET:
        "test-secret-that-is-at-least-32-characters-long-for-vitest",
    },
    setupFiles: [],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".next"],
  },
});
