import { describe, it, expect } from "vitest";
import { parsePagination, errorResponse } from "../api";

describe("parsePagination", () => {
  it("applies defaults and caps max limit", () => {
    const { page, limit, offset } = parsePagination({ page: "1", limit: "500" });
    expect(page).toBe(1);
    expect(limit).toBe(100);
    expect(offset).toBe(0);
  });
});

describe("errorResponse", () => {
  it("formats error response without leaking details", async () => {
    const response = errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      field: "type",
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid input", details: { field: "type" } },
    });
  });
});
