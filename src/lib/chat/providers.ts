import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type Database from "better-sqlite3";
import { getSettingValue } from "@/lib/settings/public";
import type { ChatProvider } from "@/lib/settings/provider-connection";
import type { Target } from "./types";

// ---------------------------------------------------------------------------
// Provider instantiation
// ---------------------------------------------------------------------------

function getProviderBaseUrl(
  db: Database.Database,
  provider: ChatProvider
): string {
  const key =
    provider === "hermes" ? "hermes_api_base" : "opencode_go_api_base";
  return getSettingValue(db, key) ?? "";
}

function getProviderApiKey(
  db: Database.Database,
  provider: ChatProvider
): string | undefined {
  const key = provider === "hermes" ? "hermes_api_key" : "opencode_go_api_key";
  const value = getSettingValue(db, key);
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Return an AI SDK language model for the given target.  Reads the
 * provider's base URL and API key from the settings table on every call
 * so a settings change takes effect immediately.
 */
export function getModelForTarget(
  db: Database.Database,
  target: Target
): LanguageModelV4 {
  const baseURL = getProviderBaseUrl(db, target.provider);
  if (!baseURL) {
    throw new Error(
      `Provider "${target.provider}" is not configured (base URL missing)`
    );
  }

  const provider = createOpenAICompatible({
    name: target.provider,
    baseURL,
    apiKey: getProviderApiKey(db, target.provider),
  });

  return provider(target.model);
}

// ---------------------------------------------------------------------------
// Model listing (cached in-memory)
// ---------------------------------------------------------------------------

export interface ModelOption {
  id: string;
  name: string;
}

interface CacheEntry {
  fetchedAt: number;
  models: ModelOption[];
}

/** In-memory cache of GET /v1/models per provider. 5-minute TTL. */
const modelCache = new Map<ChatProvider, CacheEntry>();
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * List available models for a provider by calling `GET /v1/models`.
 * Results are cached in-memory for 5 minutes.  Returns an empty array
 * when the provider is unreachable or not configured.
 */
export async function listModels(
  provider: ChatProvider,
  overrideDb?: Database.Database
): Promise<ModelOption[]> {
  const db = overrideDb;
  if (!db) {
    // Lazy import getDb to avoid pulling in the DB at module-init time
    const { getDb } = await import("@/db/index");
    return listModels(provider, getDb());
  }

  const cached = modelCache.get(provider);
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  const baseURL = getProviderBaseUrl(db, provider);
  if (!baseURL) {
    modelCache.set(provider, { fetchedAt: Date.now(), models: [] });
    return [];
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = getProviderApiKey(db, provider);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const url = `${baseURL.replace(/\/+$/, "")}/models`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      modelCache.set(provider, { fetchedAt: Date.now(), models: [] });
      return [];
    }

    const body = (await response.json()) as { data?: unknown[] };
    if (!Array.isArray(body.data)) {
      modelCache.set(provider, { fetchedAt: Date.now(), models: [] });
      return [];
    }

    const models = body.data
      .map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const record = raw as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : null;
        const name = typeof record.name === "string" ? record.name : id;
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((m): m is ModelOption => m !== null);

    modelCache.set(provider, { fetchedAt: Date.now(), models });
    return models;
  } catch {
    modelCache.set(provider, { fetchedAt: Date.now(), models: [] });
    return [];
  }
}
