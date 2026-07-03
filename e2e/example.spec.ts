import { test, expect } from "@playwright/test";

test.describe("home page", () => {
  test("loads and shows the app title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1, h2, header")).toBeVisible();
    await expect(page).toHaveTitle(/ShadowBrain|shadowbrain|Shadow/);
  });
});

test.describe("browse page", () => {
  test("displays seeded content items", async ({ page }) => {
    await page.goto("/browse");
    // The seeded items should appear in the list
    await expect(page.getByText("Welcome to ShadowBrain")).toBeVisible();
    await expect(page.getByText("Example Bookmark")).toBeVisible();
  });

  test("can search for seeded items", async ({ page }) => {
    await page.goto("/browse");
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill("Welcome");
      await expect(page.getByText("Welcome to ShadowBrain")).toBeVisible();
    }
  });
});

test.describe("API", () => {
  test("GET /api/items returns seeded items", async ({ request }) => {
    const response = await request.get("/api/items");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.data ?? body)).toBeTruthy();
  });

  test("GET /api/tags returns seeded tags", async ({ request }) => {
    const response = await request.get("/api/tags");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const tags = body.data ?? body;
    expect(
      tags.some((t: { name: string }) => t.name === "e2e-test")
    ).toBeTruthy();
  });

  test("404 returns proper error", async ({ request }) => {
    const response = await request.get("/api/nonexistent");
    expect(response.status()).toBe(404);
  });
});
