import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";

export type OpenRouterModelSummary = {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
};

type CacheEntry = {
  fetchedAt: number;
  models: OpenRouterModelSummary[];
};

const CACHE_TTL_MS = 60 * 60 * 1000;

let memoryCache: CacheEntry | null = null;

function getCacheFilePath(): string {
  const dataDir = getEnv().DATA_DIR;
  return join(process.cwd(), dataDir, "cache", "openrouter-models.json");
}

function trimModel(raw: unknown): OpenRouterModelSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const name = typeof record.name === "string" ? record.name : id;
  if (!id || !name) return null;

  const pricingRaw =
    record.pricing && typeof record.pricing === "object"
      ? (record.pricing as Record<string, unknown>)
      : {};
  const prompt =
    typeof pricingRaw.prompt === "string" ? pricingRaw.prompt : "0";
  const completion =
    typeof pricingRaw.completion === "string" ? pricingRaw.completion : "0";
  const contextLength =
    typeof record.context_length === "number" ? record.context_length : 0;

  return {
    id,
    name,
    pricing: { prompt, completion },
    context_length: contextLength,
  };
}

async function readDiskCache(): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(getCacheFilePath(), "utf8");
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(parsed.models)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(entry: CacheEntry): Promise<void> {
  const filePath = getCacheFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(entry), "utf8");
}

async function fetchFromOpenRouter(
  apiKey?: string | null
): Promise<OpenRouterModelSummary[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey && apiKey.trim() !== "") {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models request failed (${response.status})`);
  }

  const body = (await response.json()) as { data?: unknown[] };
  const models = Array.isArray(body.data)
    ? body.data
        .map(trimModel)
        .filter((model): model is OpenRouterModelSummary => model !== null)
    : [];

  return models;
}

export async function getOpenRouterModels(
  apiKey?: string | null
): Promise<OpenRouterModelSummary[]> {
  const now = Date.now();
  if (memoryCache && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.models;
  }

  try {
    const models = await fetchFromOpenRouter(apiKey);
    memoryCache = { fetchedAt: now, models };
    await writeDiskCache(memoryCache);
    return models;
  } catch (error) {
    log("warn", "OpenRouter models fetch failed; trying disk cache", {
      error: error instanceof Error ? error.message : String(error),
    });
    const disk = await readDiskCache();
    if (disk) {
      memoryCache = disk;
      return disk.models;
    }
    throw error;
  }
}
