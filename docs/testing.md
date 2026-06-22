# Testing Guide

ShadowBrain uses [Vitest](https://vitest.dev/) as its test runner. The
suite covers API routes, database repositories, security modules, and
React components. This guide covers running tests, the test helpers, and
common patterns.

---

## Running tests

```bash
pnpm test          # Watch mode (default)
pnpm test --run    # Run once and exit
pnpm test:ui       # Interactive UI dashboard (vitest --ui)

# Run a specific file
pnpm test src/db/__tests__/content-items.test.ts --run

# Run tests matching a pattern
pnpm test -t "creates a content item" --run
```

The full verification chain (lint → typecheck → build → test → knip):

```bash
pnpm verify
```

---

## Test configuration

Tests are configured in [`vitest.config.ts`](../vitest.config.ts):

- **Environment:** `node` by default. Client-component tests opt into
  `jsdom` with a `// @vitest-environment jsdom` directive at the top of
  the file.
- **Path alias:** `@/` maps to `src/` (same as the app).
- **Test env vars:** `SESSION_SECRET`, `ADMIN_USERNAME`, and
  `ADMIN_PASSWORD_HASH` are injected automatically — you don't need to
  set them.
- **Setup file:** `src/test/setup.ts` registers `@testing-library/jest-dom`
  matchers and polyfills `ResizeObserver` / `scrollIntoView` for jsdom.
- **Include pattern:** `src/**/*.test.{ts,tsx}` — tests live next to the
  code they test.

---

## Database isolation

Each vitest worker gets its own database file
(`shadowbrain.test.<worker>.db`), so concurrent test files don't
trample each other's state. Tests use the helpers in
[`src/db/test-utils.ts`](../src/db/test-utils.ts):

```ts
import {
  createTestDb, // Fresh DB with all migrations applied
  resetTestDb, // DELETE all rows (keep schema) — fast reset
  cleanupTestDb, // Close + delete the test DB file
  seedTestDb, // Insert test fixtures
  clearTable, // Clear a specific table
  getTableRowCount, // Count rows in a table
  assertTestDbEmpty, // Assert all tables are empty
} from "@/db/test-utils";
```

### Standard pattern: create → test → cleanup

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb, resetTestDb } from "@/db/test-utils";
import { contentItems } from "@/db/index";
import { getDb } from "@/db/index";

describe("contentItems", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it("creates and retrieves an item", () => {
    const db = getDb();
    // ... test logic
  });
});
```

---

## Testing API routes

API route tests call the exported handler functions directly (e.g.,
`POST`, `GET`). This bypasses the network layer but exercises all the
business logic, validation, and database access.

### Authenticated requests

Protected routes call `requireAuthenticated(request)` as defense in
depth. Tests must provide a signed session cookie. The `authedRequest`
helper handles this:

```ts
import { authedRequest } from "@/db/test-utils";
import { POST } from "@/app/api/items/route";

it("creates a content item", async () => {
  const req = await authedRequest("http://localhost/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "note", content: "hello" }),
  });

  const res = await POST(req);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.content).toBe("hello");
});
```

Helpers:

| Helper                      | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `authedRequest(url, init)`  | Wrap a Request with a signed session cookie      |
| `authedGet(url)`            | Shorthand for an authed GET with no body         |
| `extractSessionCookie(res)` | Extract the session cookie from a login response |

### Testing the login flow

The login route needs the test credentials from `vitest.config.ts`
(`admin` / `test-password`). For tests that only need a valid cookie
(without exercising the password compare), use `authedRequest` instead.

### Mocking external dependencies

Network-touching modules are mocked with `vi.mock`:

```ts
vi.mock("@/lib/metadata-fetcher", () => ({
  fetchBookmarkMetadata: vi.fn(),
}));

import { fetchBookmarkMetadata } from "@/lib/metadata-fetcher";
const mockFetcher = vi.mocked(fetchBookmarkMetadata);

beforeEach(() => {
  mockFetcher.mockReset();
  mockFetcher.mockResolvedValue({ ok: false, reason: "no url", ... });
});
```

---

## Testing React components

Client-component tests use `@testing-library/react` + jsdom. Add the
environment directive at the top of the file:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MyComponent } from "../my-component";

describe("MyComponent", () => {
  it("renders the title", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

The `@testing-library/jest-dom` matchers (`toBeInTheDocument`,
`toHaveTextContent`, …) are registered globally by `src/test/setup.ts`.

---

## Test file organization

Tests live next to the code they test, following these conventions:

```
src/
├── app/api/
│   ├── items/route.ts
│   └── __tests__/items.test.ts      # API route integration tests
├── db/
│   ├── repositories/content-items.ts
│   └── __tests__/content-items.test.ts
├── lib/
│   ├── auth/session.ts
│   └── __tests__/
│       └── auth/__tests__/session.test.ts
└── components/
    └── command-palette/
        ├── command-palette.tsx
        └── command-palette.test.tsx
```

- **`__tests__/` directories** — for module-internal tests (repository,
  API, auth tests).
- **Co-located `.test.tsx`** — for component tests next to the component.

---

## What to test

| Layer            | What to cover                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Routes**       | Happy path, validation errors (400), auth (401), not-found (404), conflict (409), visibility flags    |
| **Repositories** | CRUD operations, visibility filtering, edge cases (empty, null)                                       |
| **Security**     | Session signing/verification, CSRF origin check, rate limiting, SSRF blocking, password constant-time |
| **Components**   | Rendering, user interactions, accessibility                                                           |

### Security test patterns

Security modules have dedicated test suites that verify both the
positive case (valid input passes) and the negative case (malicious
input is blocked). For example, the SSRF tests verify that private IPs,
loopback, link-local, and DNS rebinding are all blocked — see
`src/lib/__tests__/ssrf.test.ts`.

---

## Resetting rate-limit state

Rate-limit buckets persist for the process lifetime. Tests that exercise
rate limiting must reset state between runs:

```ts
import { __resetAllRateLimiters } from "@/lib/rate-limit";

beforeEach(() => {
  __resetAllRateLimiters();
});
```
