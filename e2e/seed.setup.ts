import { test as setup } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3011";

interface Item {
  id: string;
  title: string;
}

setup("seed e2e database with test data", async () => {
  // Auth is bypassed in e2e mode (see src/proxy.ts and src/lib/auth/guard.ts),
  // so all fetch calls below succeed without session cookies.

  // Clean up any previously seeded items so the setup is idempotent across
  // repeated runs against a reused server (reuseExistingServer: true in dev).
  const existing = await fetch(`${BASE}/api/items`).then((r) => r.json());
  const items = (existing.items ?? []) as Item[];
  for (const item of items) {
    if (
      item.title === "Welcome to ShadowBrain" ||
      item.title === "Example Bookmark"
    ) {
      await fetch(`${BASE}/api/items/${item.id}`, { method: "DELETE" });
    }
  }

  // Create test content items
  const newItems = [
    {
      type: "note",
      title: "Welcome to ShadowBrain",
      content:
        "This is a sample note for e2e testing. It demonstrates that the app is working correctly.",
      source: "e2e-seed",
    },
    {
      type: "bookmark",
      title: "Example Bookmark",
      content: "An example bookmark content for testing the browse page.",
      source: "web",
    },
  ];

  for (const item of newItems) {
    await fetch(`${BASE}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
  }

  // Create a tag (idempotent — POST /api/tags returns the existing tag if it already exists)
  await fetch(`${BASE}/api/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "e2e-test" }),
  });

  console.log("✓ E2E database seeded");
});
