import { describe, it, expect } from "vitest";
import {
  getModelContextWindow,
  formatTokenCount,
  formatRelativeTime,
} from "@/lib/chat/model-metadata";

describe("getModelContextWindow", () => {
  it("returns known model context windows", () => {
    expect(getModelContextWindow("deepseek-v3-flash")).toBe(128_000);
    expect(getModelContextWindow("hermes-agent")).toBe(128_000);
  });

  it("matches by prefix", () => {
    // deepseek-v4-pro-special starts with "deepseek"
    expect(getModelContextWindow("deepseek-v4-pro-special")).toBe(128_000);
  });

  it("falls back to default for unknown models", () => {
    expect(getModelContextWindow("unknown-model-xyz")).toBe(128_000);
  });

  it("returns default for empty string", () => {
    expect(getModelContextWindow("")).toBe(128_000);
  });
});

describe("formatTokenCount", () => {
  it("returns exact for small numbers (< 1000)", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(42)).toBe("42");
    expect(formatTokenCount(999)).toBe("999");
  });

  it("formats with 1 decimal for 1k–10k", () => {
    expect(formatTokenCount(1200)).toBe("1.2k");
    expect(formatTokenCount(2500)).toBe("2.5k");
    expect(formatTokenCount(9999)).toBe("10k"); // rounds to 10k
  });

  it("formats as integer k for >= 10k", () => {
    expect(formatTokenCount(10_000)).toBe("10k");
    expect(formatTokenCount(42_500)).toBe("42k"); // rounds down
    expect(formatTokenCount(128_000)).toBe("128k");
  });

  it("drops trailing .0", () => {
    expect(formatTokenCount(1000)).toBe("1k");
    expect(formatTokenCount(2000)).toBe("2k");
    expect(formatTokenCount(3000)).toBe("3k");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.now();

  it('returns "just now" for < 60s', () => {
    const justNow = new Date(now - 30_000).toISOString();
    expect(formatRelativeTime(justNow)).toBe("just now");
  });

  it('returns "1m ago" for 60s–119s', () => {
    const oneMin = new Date(now - 90_000).toISOString();
    expect(formatRelativeTime(oneMin)).toBe("1m ago");
  });

  it('returns "Xm ago" for minutes', () => {
    const fiveMin = new Date(now - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMin)).toBe("5m ago");
  });

  it('returns "1h ago" for 1 hour', () => {
    const oneHour = new Date(now - 70 * 60_000).toISOString();
    expect(formatRelativeTime(oneHour)).toBe("1h ago");
  });

  it('returns "Xh ago" for hours', () => {
    const threeHours = new Date(now - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHours)).toBe("3h ago");
  });

  it('returns "yesterday" for ~24h', () => {
    const yesterday = new Date(now - 25 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(yesterday)).toBe("yesterday");
  });

  it('returns "Xd ago" for days', () => {
    const threeDays = new Date(now - 3 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeDays)).toBe("3d ago");
  });

  it('returns "Xw ago" for weeks', () => {
    const twoWeeks = new Date(now - 14 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twoWeeks)).toBe("2w ago");
  });
});
