import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  authedGet,
  authedRequest,
  cleanupTestDb,
  createTestDb,
} from "@/db/test-utils";
import { getDb, settings } from "@/db/index";
import { GET, PATCH } from "@/app/api/settings/route";
import { POST as POST_TEST } from "@/app/api/settings/test-connection/route";
import { GET as GET_SYSTEM_INFO } from "@/app/api/settings/system-info/route";
import { GET as GET_EXPORT } from "@/app/api/export/route";

describe("/api/settings", () => {
  beforeEach(() => {
    cleanupTestDb();
    createTestDb().close();
  });

  afterEach(() => {
    cleanupTestDb();
    vi.unstubAllGlobals();
  });

  it("masks secret values in GET", async () => {
    const db = getDb();
    settings.set(db, "openrouter_api_key", "sk-secret");

    const res = await GET(await authedGet("http://localhost/api/settings"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openrouter_api_key).toBeUndefined();
    expect(json.openrouter_api_key_is_set).toBe(true);
    expect(json.ai_model).toBe("mistralai/mistral-7b-instruct");
  });

  it("updates non-secret settings via PATCH", async () => {
    const res = await PATCH(
      await authedRequest("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_model: "openai/gpt-4" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ai_model).toBe("openai/gpt-4");

    const db = getDb();
    expect(settings.get(db, "ai_model")).toBe("openai/gpt-4");
  });

  it("leaves secrets unchanged when PATCH sends an empty string", async () => {
    const db = getDb();
    settings.set(db, "openrouter_api_key", "sk-existing");

    const res = await PATCH(
      await authedRequest("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openrouter_api_key: "",
          ai_model: "openai/gpt-4",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(settings.get(db, "openrouter_api_key")).toBe("sk-existing");
  });

  it("clears secrets when PATCH sends null", async () => {
    const db = getDb();
    settings.set(db, "openrouter_api_key", "sk-existing");

    const res = await PATCH(
      await authedRequest("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openrouter_api_key: null }),
      })
    );
    expect(res.status).toBe(200);
    expect(settings.get(db, "openrouter_api_key")).toBeNull();
  });

  it("rejects unknown keys", async () => {
    const res = await PATCH(
      await authedRequest("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unknown_key: "x" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("tests provider connection using saved settings", async () => {
    const db = getDb();
    settings.set(db, "hermes_api_base", "http://localhost:8642/v1");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "hermes-agent" }] }),
      }))
    );

    const res = await POST_TEST(
      await authedRequest("http://localhost/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "hermes" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.modelCount).toBe(1);
  });

  it("returns system info", async () => {
    const res = await GET_SYSTEM_INFO(
      await authedGet("http://localhost/api/settings/system-info")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("totalItems");
    expect(json).toHaveProperty("databaseSize");
    expect(json).toHaveProperty("lastBackupAt");
  });

  it("exports content as JSON", async () => {
    const res = await GET_EXPORT(
      await authedGet("http://localhost/api/export?format=json")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.text();
    expect(body.startsWith("[")).toBe(true);
  });
});
