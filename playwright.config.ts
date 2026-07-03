import { defineConfig } from "@playwright/test";

const BASE_PORT = 3001;
const BASE_URL = `http://localhost:${BASE_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    headless: true,
  },

  webServer: {
    command: "next dev",
    port: BASE_PORT,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NODE_ENV: "e2e",
      PORT: String(BASE_PORT),
      // Dummy values — required by Zod schema validation at startup but
      // never actually used because auth is bypassed in e2e mode
      // (see src/proxy.ts and src/lib/auth/guard.ts).
      // Setting these explicitly prevents the e2e server from inheriting
      // production secrets from the ambient environment.
      ADMIN_USERNAME: "e2e-admin",
      ADMIN_PASSWORD_HASH:
        "$2b$10$e2e-dummy-hash-not-for-production-use-xxxxxxxxxxx",
      SESSION_SECRET: "e2e-session-secret-at-least-32-chars!!",
    },
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
});
