import type Database from "better-sqlite3";
import { getSettingValue } from "@/lib/settings/public";

export type ChatProvider = "hermes" | "opencode-go";

export type ProviderConnectionResult =
  | { ok: true; modelCount: number }
  | { ok: false; reason: string };

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

function getProviderCredentials(
  db: Database.Database,
  provider: ChatProvider
): { baseUrl: string | null; apiKey: string | null } {
  if (provider === "hermes") {
    return {
      baseUrl: getSettingValue(db, "hermes_api_base"),
      apiKey: getSettingValue(db, "hermes_api_key"),
    };
  }
  return {
    baseUrl: getSettingValue(db, "opencode_go_api_base"),
    apiKey: getSettingValue(db, "opencode_go_api_key"),
  };
}

export async function testProviderConnection(
  db: Database.Database,
  provider: ChatProvider
): Promise<ProviderConnectionResult> {
  const { baseUrl, apiKey } = getProviderCredentials(db, provider);

  if (!baseUrl) {
    return { ok: false, reason: "Base URL is not configured" };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey && apiKey.trim() !== "") {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const url = `${normalizeBaseUrl(baseUrl)}/models`;

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `Provider returned ${response.status}`,
      };
    }

    const body = (await response.json()) as { data?: unknown[] };
    const modelCount = Array.isArray(body.data) ? body.data.length : 0;
    return { ok: true, modelCount };
  } catch {
    return { ok: false, reason: "Could not reach provider" };
  }
}

export type ProviderModelOption = { id: string; name: string };

export async function listProviderModels(
  db: Database.Database,
  provider: ChatProvider
): Promise<ProviderModelOption[]> {
  const { baseUrl, apiKey } = getProviderCredentials(db, provider);
  if (!baseUrl) return [];

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey && apiKey.trim() !== "") {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Provider models request failed (${response.status})`);
  }

  const body = (await response.json()) as { data?: unknown[] };
  if (!Array.isArray(body.data)) return [];

  return body.data
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const record = raw as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : null;
      const name = typeof record.name === "string" ? record.name : id;
      if (!id || !name) return null;
      return { id, name };
    })
    .filter((model): model is ProviderModelOption => model !== null);
}
