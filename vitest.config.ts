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
      // Single-user admin creds for the test environment. The hash is
      // for the literal password "test-password" (cost 10). Tests that
      // exercise the real login flow use these values; tests that only
      // need a valid cookie use createAuthedRequest() which signs a
      // cookie without hitting the password compare path.
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH:
        "$2b$10$.8miRowqAy0BGbtsRGODdOy/QJ11HdyOHLjLCK8AoPf.X.32x1U76",
    },
    setupFiles: [],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".next"],
  },
});
