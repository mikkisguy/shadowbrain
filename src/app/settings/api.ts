import { z } from "zod";

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
import { IMPORT_MAX_ISSUE_MESSAGE_LENGTH } from "@/lib/data-export/limits";

export class SettingsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly issues: string[];

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    issues: string[] = []
  ) {
    super(message);
    this.name = "SettingsApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

const MAX_VALIDATION_ISSUES = 50;

const errorResponseSchema = z.object({
  error: z.object({
    code: z.unknown().optional(),
    message: z.unknown().optional(),
    details: z.unknown().optional(),
  }),
});

function parseValidationIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const issues: string[] = [];
  for (const issue of value) {
    if (issues.length >= MAX_VALIDATION_ISSUES) break;

    if (typeof issue === "string") {
      if (issue.length > 0) {
        issues.push(issue.slice(0, IMPORT_MAX_ISSUE_MESSAGE_LENGTH));
      }
      continue;
    }

    if (
      issue &&
      typeof issue === "object" &&
      !Array.isArray(issue) &&
      "message" in issue &&
      typeof issue.message === "string" &&
      issue.message.length > 0
    ) {
      const path =
        "path" in issue && typeof issue.path === "string" ? issue.path : "";
      const text = path ? `${path}: ${issue.message}` : issue.message;
      issues.push(text.slice(0, IMPORT_MAX_ISSUE_MESSAGE_LENGTH));
    }
  }
  return issues;
}

async function readErrorDetails(response: Response): Promise<{
  code: string | null;
  message: string;
  issues: string[];
}> {
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      const details = parsed.data.error.details;
      const issues =
        details &&
        typeof details === "object" &&
        !Array.isArray(details) &&
        "issues" in details
          ? details.issues
          : undefined;
      return {
        code:
          typeof parsed.data.error.code === "string"
            ? parsed.data.error.code
            : null,
        message:
          typeof parsed.data.error.message === "string" &&
          parsed.data.error.message.length > 0
            ? parsed.data.error.message
            : `Request failed with status ${response.status}`,
        issues: parseValidationIssues(issues),
      };
    }
  } catch {
    // Non-JSON body.
  }
  return {
    code: null,
    message: `Request failed with status ${response.status}`,
    issues: [],
  };
}

async function throwForResponse(response: Response): Promise<never> {
  const details = await readErrorDetails(response);
  throw new SettingsApiError(
    response.status,
    details.message,
    details.code,
    details.issues
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

export function importSchemaUrl(): string {
  return "/api/import/schema";
}

export function importTemplateUrl(): string {
  return "/api/import/template";
}

export interface JsonImportSummary {
  mode: "merge";
  created: {
    items: number;
    tags: number;
    item_tags: number;
    links: number;
    journal_periods: number;
  };
  reused_tags: number;
  warnings: string[];
}

export async function importJsonData(
  data: unknown,
  mode?: "merge"
): Promise<JsonImportSummary> {
  const response = await fetch("/api/import", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: mode ?? "merge", data }),
  });
  if (!response.ok) await throwForResponse(response);
  return (await response.json()) as JsonImportSummary;
}

export interface ApiTokenInfo {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  last_used_ip: string | null;
  is_revoked: number;
}

export interface CreatedApiToken {
  id: string;
  name: string;
  token: string;
  created_at: string;
}

export async function fetchApiTokens(
  signal?: AbortSignal
): Promise<ApiTokenInfo[]> {
  const response = await fetch("/api/admin/api-tokens", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) await throwForResponse(response);
  return (await response.json()) as ApiTokenInfo[];
}

export async function createApiToken(name: string): Promise<CreatedApiToken> {
  const response = await fetch("/api/admin/api-tokens", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) await throwForResponse(response);
  return (await response.json()) as CreatedApiToken;
}

export async function revokeApiToken(id: string): Promise<void> {
  const response = await fetch(
    `/api/admin/api-tokens/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }
  );
  if (!response.ok) await throwForResponse(response);
}
