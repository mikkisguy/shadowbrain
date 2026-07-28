import { describe, it, expect } from "vitest";
import { metadataToDraftFields, draftToMetadata } from "./metadata-helpers";
import type { Draft } from "./types";

// ---------------------------------------------------------------------------
// Helper: build a Draft from partial overrides
// ---------------------------------------------------------------------------
function draft(overrides: Partial<Draft>): Draft {
  const base: Draft = {
    type: "",
    content: "",
    title: "",
    sourceUrl: "",
    email: "",
    phoneNumber: "",
    role: "",
    status: "",
    repo: "",
    started: "",
    goalEndDate: "",
    startDate: "",
    endDate: "",
    duration: "",
    dueDate: "",
    mood: "",
    imageUrl: "",
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("metadataToDraftFields / draftToMetadata", () => {
  describe("task", () => {
    it("roundtrips status/due_date/start_date/end_date between snake_case and camelCase", () => {
      const metadata = JSON.stringify({
        status: "in_progress",
        due_date: "2024-12-01",
        start_date: "2024-11-01",
        end_date: "2024-12-15",
      });

      const fields = metadataToDraftFields("task", metadata);
      expect(fields).toEqual({
        status: "in_progress",
        dueDate: "2024-12-01",
        startDate: "2024-11-01",
        endDate: "2024-12-15",
      });

      const result = draftToMetadata(draft({ type: "task", ...fields }));
      expect(result).not.toBeNull();
      expect(result).toEqual({
        status: "in_progress",
        due_date: "2024-12-01",
        start_date: "2024-11-01",
        end_date: "2024-12-15",
      });
    });

    it("defaults empty status to 'todo' on draftToMetadata", () => {
      const result = draftToMetadata(
        draft({ type: "task", status: "", dueDate: "2024-12-01" })
      );
      expect(result).not.toBeNull();
      expect(result).toEqual({
        status: "todo",
        due_date: "2024-12-01",
      });
    });
  });

  describe("event", () => {
    it("roundtrips status in_progress between snake_case and camelCase", () => {
      const metadata = JSON.stringify({
        status: "in_progress",
        start_date: "2025-01-10",
        end_date: "2025-01-12",
      });

      const fields = metadataToDraftFields("event", metadata);
      expect(fields).toEqual({
        status: "in_progress",
        startDate: "2025-01-10",
        endDate: "2025-01-12",
      });

      const result = draftToMetadata(draft({ type: "event", ...fields }));
      expect(result).not.toBeNull();
      expect(result).toEqual({
        status: "in_progress",
        start_date: "2025-01-10",
        end_date: "2025-01-12",
      });
    });

    it("does NOT write a non-enum status to metadata", () => {
      const result = draftToMetadata(
        draft({
          type: "event",
          status: "cancelled",
          startDate: "2025-06-01",
        })
      );
      expect(result).not.toBeNull();
      expect(result).toEqual({ start_date: "2025-06-01" });
      expect(result).not.toHaveProperty("status");
    });

    it("does NOT invent a status when event has no status", () => {
      const result = draftToMetadata(
        draft({
          type: "event",
          status: "",
          startDate: "2025-06-01",
        })
      );
      expect(result).not.toBeNull();
      expect(result).toEqual({ start_date: "2025-06-01" });
      expect(result).not.toHaveProperty("status");
    });
  });
});
