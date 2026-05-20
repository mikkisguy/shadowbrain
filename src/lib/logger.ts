type LogLevel = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = ["authorization", "cookie", "set-cookie", "api-key", "apikey"];

function redactObject(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactObject);
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
    if (REDACT_KEYS.includes(k.toLowerCase())) {
      return [k, "[REDACTED]"] as const;
    }
    return [k, redactObject(v)] as const;
  });
  return Object.fromEntries(entries);
}

export function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    msg,
    ...redactObject(meta ?? {}),
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
