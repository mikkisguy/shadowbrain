import { describe, it, expect } from "vitest";
import { formatModelName } from "../format-model-name";

describe("formatModelName", () => {
  it("converts dashes to spaces and capitalizes words", () => {
    expect(formatModelName("deepseek-v3-flash")).toBe("Deepseek V3 Flash");
  });

  it("handles underscores", () => {
    expect(formatModelName("gpt_4_turbo")).toBe("Gpt 4 Turbo");
  });

  it("handles single word", () => {
    expect(formatModelName("claude")).toBe("Claude");
  });

  it("handles mixed separators", () => {
    expect(formatModelName("model-name_v2")).toBe("Model Name V2");
  });

  it("preserves numbers", () => {
    expect(formatModelName("deepseek-v3")).toBe("Deepseek V3");
  });
});
