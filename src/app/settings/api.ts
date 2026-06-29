import type { PublicSettings } from "@/lib/settings/public";
import type {
  OpenRouterModelSummary,
  ProviderModelOption,
  SettingsDraft,
  SettingsSnapshot,
  SystemInfo,
  TestConnectionResult,
} from "./types";
import { publicSettingsToSnapshot } from "./types";

export class SettingsApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "SettingsApiError";
    this.status = status;
    this.code = code;
  }
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as unknown;
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "code" in body.error &&
      typeof (body.error as { code: unknown }).code === "string"
    ) {
      return (body.error as { code: string }).code;
    }
  } catch {
    // Non-JSON body.
  }
  return null;
}

async function throwForResponse(response: Response): Promise<never> {
  const code = await readErrorCode(response);
  throw new SettingsApiError(
    response.status,
    `Request failed with status ${response.status}`,
    code
  );
}

export async function fetchSettings(
  signal?: AbortSignal
): Promise<SettingsSnapshot> {
  const response = await fetch("/api/settings", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) await throwForResponse(response);
  const body = (await response.json()) as PublicSettings;
  return publicSettingsToSnapshot(body);
}

export async function saveSettings(
  patch: Partial<SettingsDraft> & {
    openrouter_api_key?: string | null;
    hermes_api_key?: string | null;
    opencode_go_api_key?: string | null;
  }
): Promise<SettingsSnapshot> {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) await throwForResponse(response);
  const body = (await response.json()) as PublicSettings;
  return publicSettingsToSnapshot(body);
}

export async function fetchOpenRouterModels(
  signal?: AbortSignal
): Promise<OpenRouterModelSummary[]> {
  const response = await fetch("/api/settings/openrouter/models", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) await throwForResponse(response);
  const body = (await response.json()) as { models?: OpenRouterModelSummary[] };
  return Array.isArray(body.models) ? body.models : [];
}

export async function fetchProviderModels(
  provider: "opencode-go",
  signal?: AbortSignal
): Promise<ProviderModelOption[]> {
  const response = await fetch(
    `/api/settings/provider-models?provider=${encodeURIComponent(provider)}`,
    {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    }
  );
  if (!response.ok) await throwForResponse(response);
  const body = (await response.json()) as { models?: ProviderModelOption[] };
  return Array.isArray(body.models) ? body.models : [];
}

export async function testConnection(
  provider: "hermes" | "opencode-go"
): Promise<TestConnectionResult> {
  const response = await fetch("/api/settings/test-connection", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok) await throwForResponse(response);
  return (await response.json()) as TestConnectionResult;
}

export async function fetchSystemInfo(
  signal?: AbortSignal
): Promise<SystemInfo> {
  const response = await fetch("/api/settings/system-info", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) await throwForResponse(response);
  return (await response.json()) as SystemInfo;
}

export function exportUrl(format: "markdown" | "json"): string {
  return `/api/export?format=${format}`;
}
