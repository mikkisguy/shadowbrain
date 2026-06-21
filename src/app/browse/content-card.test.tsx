// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentCard, formatRelativeTime, previewText } from "./content-card";
import type { BrowseItem } from "./types";

/**
 * Content-card tests.
 *
 * The card is purely presentational — its tests cover:
 *   - the type badge uses the correct colour token
 *   - the title renders when present
 *   - the content preview is line-clamped and word-bounded
 *   - the timestamp is rendered as a relative phrase
 *   - the tag strip lists up to four tags
 *
 * The relative-time helper is a pure function so we can pin the
 * exact output for known intervals without a clock dependency.
 */

const baseItem: BrowseItem = {
  id: "id-1",
  type: "note",
  title: "Docker networking basics",
  content: "Bridge networks are the default. Each container joins…",
  source: "manual",
  source_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("ContentCard", () => {
  it("renders the type label and the correct coloured dot", () => {
    render(<ContentCard item={baseItem} />);
    const card = screen.getByTestId("content-card");
    expect(card).toHaveAttribute("data-item-type", "note");
    expect(card).toHaveTextContent(/note/i);
    // The dot is a span with `bg-type-note` so the colour token
    // is applied via Tailwind utility.
    const dot = card.querySelector("span.bg-type-note");
    expect(dot).not.toBeNull();
  });

  it("renders the title in a serif heading", () => {
    render(<ContentCard item={baseItem} />);
    const title = screen.getByRole("heading", { level: 3 });
    expect(title).toHaveTextContent("Docker networking basics");
    expect(title.className).toMatch(/font-serif/);
  });

  it("renders the content preview as a line-clamped paragraph", () => {
    render(<ContentCard item={baseItem} />);
    const preview = screen.getByText(/Bridge networks/);
    expect(preview.tagName).toBe("P");
    expect(preview.className).toMatch(/line-clamp-3/);
  });

  it("omits the heading when the item has no title", () => {
    const untitled: BrowseItem = { ...baseItem, title: null };
    render(<ContentCard item={untitled} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("renders the tag strip with up to four tags", () => {
    render(
      <ContentCard
        item={baseItem}
        tags={["docker", "networking", "infra", "linux", "core"]}
      />
    );
    const tagList = screen.getByRole("list", { name: /tags/i });
    expect(tagList.children).toHaveLength(4);
    expect(tagList).toHaveTextContent("#docker");
    // The fifth tag is dropped — the strip is capped at 4.
    expect(tagList).not.toHaveTextContent("#core");
  });

  it("renders a relative timestamp", () => {
    const item: BrowseItem = {
      ...baseItem,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    };
    render(<ContentCard item={item} />);
    const time = screen.getByRole("time");
    expect(time.textContent).toMatch(/ago|minute/);
    expect(time).toHaveAttribute("datetime");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-21T12:00:00.000Z");
  it('returns "just now" for < 1 minute', () => {
    expect(formatRelativeTime("2026-06-21T11:59:30.000Z", now)).toBe(
      "just now"
    );
  });
  it("returns a minute phrase for < 1 hour", () => {
    expect(formatRelativeTime("2026-06-21T11:45:00.000Z", now)).toMatch(
      /15 minutes ago/
    );
  });
  it("returns an hour phrase for < 1 day", () => {
    expect(formatRelativeTime("2026-06-21T08:00:00.000Z", now)).toMatch(
      /4 hours ago/
    );
  });
  it("returns a day phrase for < 1 week", () => {
    expect(formatRelativeTime("2026-06-19T12:00:00.000Z", now)).toMatch(
      /2 days ago/
    );
  });
  it("returns a future phrase in the right tense", () => {
    expect(formatRelativeTime("2026-06-21T13:00:00.000Z", now)).toMatch(
      /in 1 hour/
    );
  });
});

describe("previewText", () => {
  it("returns the input unchanged when shorter than the limit", () => {
    expect(previewText("hello", 10)).toBe("hello");
  });
  it("appends an ellipsis when truncated", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const out = previewText(text, 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith("…")).toBe(true);
  });
  it("truncates at a word boundary when one is in range", () => {
    const text = "alpha beta gamma delta epsilon";
    const out = previewText(text, 14);
    // Cuts at the space after "beta" (5 chars + space = 6).
    expect(out).toMatch(/^alpha beta…?$/);
  });
});
