// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ItemDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  findWithRelations: vi.fn(),
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/index", () => ({
  getDb: mocks.getDb,
  contentItems: {
    findWithRelations: mocks.findWithRelations,
  },
}));

afterEach(() => {
  mocks.findWithRelations.mockReset();
  mocks.getDb.mockClear();
});

function mockItem(type: string, metadata: string | null) {
  mocks.findWithRelations.mockReturnValue({
    item: {
      id: "1",
      type,
      title: `${type} item`,
      content: "content",
      image_path: null,
      source: "manual",
      source_url: null,
      metadata,
      is_private: 0,
      is_hidden: 0,
      created_at: "2026-04-12T15:30:45.000Z",
      updated_at: "2026-04-12T16:45:12.000Z",
    },
    tags: [],
  });
}

describe("ItemDetailPage metadata rendering (issue #103)", () => {
  it("renders person metadata fields", async () => {
    mockItem(
      "person",
      JSON.stringify({
        email: "jane@example.com",
        social_links: ["https://github.com/jane", "https://x.com/jane"],
        phone_number: "+1 555 0100",
        role: "Senior Engineer",
      })
    );

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByLabelText("Metadata")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Social links")).toBeInTheDocument();
    expect(
      screen.getByText("https://github.com/jane, https://x.com/jane")
    ).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
  });

  it("renders project metadata fields", async () => {
    mockItem(
      "project",
      JSON.stringify({
        status: "active",
        repo: "https://github.com/example/branchforge",
        started: "2026-01-01T09:00:00.000Z",
        goal_end_date: "2026-12-31T18:00:00.000Z",
      })
    );

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByText("Goal end date")).toBeInTheDocument();
    expect(screen.getByText("Dec 31, 2026, 6:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2026, 9:00 AM")).toBeInTheDocument();
  });

  it("renders event start and end timestamps", async () => {
    mockItem(
      "event",
      JSON.stringify({
        start_date: "2026-04-12T09:30:00.000Z",
        end_date: "2026-04-12T11:15:00.000Z",
        duration: "1h 45m",
      })
    );

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Apr 12, 2026, 9:30 AM")).toBeInTheDocument();
    expect(screen.getByText("End")).toBeInTheDocument();
    expect(screen.getByText("Apr 12, 2026, 11:15 AM")).toBeInTheDocument();
  });

  it("omits dream lucidity", async () => {
    mockItem(
      "dream",
      JSON.stringify({
        mood: "surreal",
      })
    );

    render(await ItemDetailPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByText("Mood")).toBeInTheDocument();
    expect(screen.queryByText("Lucidity")).not.toBeInTheDocument();
  });
});
