// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ContentCard,
  formatAbsoluteTime,
  formatRelativeTime,
  metadataSummary,
  previewText,
} from "./content-card";
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
 *   - the card collapses to a compact mobile layout (single-line title/preview, tag count)
 *
 * The relative-time helper is a pure function so we can pin the
 * exact output for known intervals without a clock dependency.
 */

const baseItem: BrowseItem = {
  id: "id-1",
  type: "note",
  title: "Docker networking basics",
  content: "Bridge networks are the default. Each container joins…",
  image_url: null,
  source: "manual",
  source_url: null,
  tags: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("ContentCard", () => {
  it("renders the type label and a coloured dot in the default (larger-dot) variant", () => {
    render(<ContentCard item={baseItem} />);
    const card = screen.getByTestId("content-card");
    expect(card).toHaveAttribute("data-item-type", "note");
    expect(card).toHaveTextContent(/note/i);
    // The dot carries the `bg-type-note` token. The
    // `larger-dot` variant uses `size-2.5` so the dot is
    // slightly chunkier than the original 1.5-px dot.
    const dot = card.querySelector("span.bg-type-note");
    expect(dot).not.toBeNull();
    expect(dot?.className).toMatch(/size-2\.5/);
    expect(dot?.className).toMatch(/rounded-full/);
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
    expect(preview.className).toMatch(/md:line-clamp-3/);
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
    // Up to four tag pills are rendered (the strip is capped at 4);
    // the mobile compact count is a separate affordance.
    expect(screen.getAllByTestId("content-card-tag")).toHaveLength(4);
    expect(tagList).toHaveTextContent("#docker");
    // The fifth tag is dropped — the strip is capped at 4.
    expect(tagList).not.toHaveTextContent("#core");
  });

  it("clamps the title to one line on mobile and frees it at md+", () => {
    render(<ContentCard item={baseItem} />);
    const title = screen.getByRole("heading", { level: 3 });
    expect(title.className).toMatch(/max-md:line-clamp-1/);
  });

  it("clamps the preview to one line on mobile and three lines at md+", () => {
    render(<ContentCard item={baseItem} />);
    const preview = screen.getByText(/Bridge networks/);
    expect(preview.className).toMatch(/line-clamp-1/);
    expect(preview.className).toMatch(/md:line-clamp-3/);
  });

  it("renders a compact 'N tags' count for the mobile card", () => {
    render(<ContentCard item={baseItem} tags={["docker", "infra", "linux"]} />);
    const tagList = screen.getByRole("list", { name: /tags/i });
    // Mobile compact mode shows an "N tags" summary in place of the
    // pill strip (the pills return at md+ where the card has room).
    expect(tagList).toHaveTextContent(/3 tags/i);
  });

  it("renders tags from item.tags when no tags prop is passed", () => {
    const item: BrowseItem = { ...baseItem, tags: ["docker", "infra"] };
    render(<ContentCard item={item} />);
    const tagList = screen.getByRole("list", { name: /tags/i });
    expect(tagList).toHaveTextContent("#docker");
    expect(tagList).toHaveTextContent("#infra");
  });

  it("calls onTagClick when a tag pill is clicked", async () => {
    const user = userEvent.setup();
    const onTagClick = vi.fn();
    render(
      <ContentCard
        item={baseItem}
        tags={["docker", "infra"]}
        onTagClick={onTagClick}
      />
    );
    await user.click(
      screen.getByRole("button", { name: /filter by tag docker/i })
    );
    expect(onTagClick).toHaveBeenCalledWith("docker");
    expect(onTagClick).toHaveBeenCalledTimes(1);
  });

  it("renders the tag pills as the first tags in the list", () => {
    // Sanity: the tag buttons carry the `content-card-tag` test id
    // and the visible `#name` text, so the feed / e2e layer can
    // target them without coupling to class names.
    render(<ContentCard item={baseItem} tags={["docker"]} />);
    const tag = screen.getByTestId("content-card-tag");
    expect(tag.tagName).toBe("BUTTON");
    expect(tag).toHaveTextContent("#docker");
  });

  it("renders a stretched link that navigates to /item/[id]", () => {
    render(<ContentCard item={baseItem} />);
    const link = screen.getByRole("link", {
      name: /open docker networking basics/i,
    });
    expect(link).toHaveAttribute("href", "/item/id-1");
  });

  it("the card link still appears for untitled items", () => {
    const untitled: BrowseItem = { ...baseItem, title: null };
    render(<ContentCard item={untitled} />);
    // Falls back to the type label in the aria-label.
    const link = screen.getByRole("link", { name: /open note/i });
    expect(link).toHaveAttribute("href", "/item/id-1");
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

  it("does not carry a native title tooltip — the custom tooltip owns it", () => {
    // The timestamp used to set `title={created_at}` (a slow,
    // unstyled native tooltip with the raw ISO string). Now the
    // Base UI tooltip shows the formatted absolute time instead.
    render(<ContentCard item={baseItem} />);
    expect(screen.getByRole("time")).not.toHaveAttribute("title");
  });

  it("reveals the absolute time in a tooltip on hover", async () => {
    const user = userEvent.setup();
    const item: BrowseItem = {
      ...baseItem,
      created_at: "2026-06-21T12:00:00.000Z",
    };
    render(<ContentCard item={item} />);
    await user.hover(screen.getByRole("time"));
    // The popup is portalled to <body>; `screen` covers the whole
    // document, so the absolute phrase is findable once open.
    expect(await screen.findByText(/2026/)).toBeInTheDocument();
  });

  it("does not render the image frame when image_url is null", () => {
    render(<ContentCard item={baseItem} />);
    const card = screen.getByTestId("content-card");
    expect(card).toHaveAttribute("data-has-image", "false");
    expect(screen.queryByTestId("content-card-image")).not.toBeInTheDocument();
  });

  it("renders the image at the top when image_url is set on an image-type card", () => {
    const withImage: BrowseItem = {
      ...baseItem,
      type: "image",
      image_url: "/api/images/notes/docker.png",
    };
    render(<ContentCard item={withImage} />);
    const card = screen.getByTestId("content-card");
    expect(card).toHaveAttribute("data-has-image", "true");
    const img = screen.getByTestId("content-card-image");
    expect(img).toHaveAttribute("src", "/api/images/notes/docker.png");
    // The image frame is the first child of the article, before
    // the content body. We assert it comes before the type badge.
    const firstChildTag = card.firstElementChild?.tagName;
    expect(firstChildTag).toBe("DIV");
  });

  it("renders a background-fade image when image_url is set on a non-image-type card", () => {
    const withImage: BrowseItem = {
      ...baseItem,
      type: "journal",
      image_url: "/api/images/journals/travel.png",
    };
    render(<ContentCard item={withImage} />);
    const card = screen.getByTestId("content-card");
    expect(card).toHaveAttribute("data-has-image", "true");
    // Should render the background image element
    const bgImg = screen.getByTestId("content-card-bg-image");
    expect(bgImg).toHaveAttribute("src", "/api/images/journals/travel.png");
    // Should NOT render the top-banner image
    expect(screen.queryByTestId("content-card-image")).not.toBeInTheDocument();
    // Background element should be absolute positioned and fill the card
    expect(bgImg.className).toMatch(/absolute inset-0/);
  });

  it("does not render background-fade on image-type cards with image_url", () => {
    const withImage: BrowseItem = {
      ...baseItem,
      type: "image",
      image_url: "/api/images/photos/flower.png",
    };
    render(<ContentCard item={withImage} />);
    // Should NOT render the background image
    expect(
      screen.queryByTestId("content-card-bg-image")
    ).not.toBeInTheDocument();
    // Should render the top-banner image
    expect(screen.getByTestId("content-card-image")).toBeInTheDocument();
  });

  it("the card has natural height — not forced to fill a grid row", () => {
    render(<ContentCard item={baseItem} />);
    const card = screen.getByTestId("content-card");
    expect(card.className).not.toMatch(/\bh-full\b/);
  });

  it("the body grows to fill the card and pushes the tag strip to the bottom", () => {
    const baseWithTags: BrowseItem = { ...baseItem };
    const { container } = render(
      <ContentCard item={baseWithTags} tags={["docker"]} />
    );
    // The body div is `flex-1`; the tag <ul> is `mt-auto`. These
    // are the two properties that make a card's content distribute
    // vertically — the tag strip always ends at the card's
    // natural bottom.
    const body = container.querySelector("article > .flex-1");
    expect(body).not.toBeNull();
    const tagList = screen.getByRole("list", { name: /tags/i });
    expect(tagList.className).toMatch(/mt-auto/);
  });

  it("the 'pill' variant replaces the dot + text with a filled coloured chip", () => {
    render(<ContentCard item={baseItem} variant="pill" />);
    const pill = screen.getByTestId("content-card-pill");
    expect(pill).toHaveTextContent(/note/i);
    // The pill background uses the type token; the foreground is
    // the inverted (dark) token for contrast on the saturated fill.
    expect(pill.className).toMatch(/bg-type-note/);
    expect(pill.className).toMatch(/text-foreground-inverted/);
    // No standalone dot is rendered in the pill variant — the
    // chip itself is the indicator.
    const card = screen.getByTestId("content-card");
    expect(card.querySelector("span.bg-type-note.rounded-full")).toBeNull();
  });

  it("the 'larger-dot' variant uses the chunkier 2.5-px dot (not the pill)", () => {
    render(<ContentCard item={baseItem} variant="larger-dot" />);
    const card = screen.getByTestId("content-card");
    // Dot uses `size-2.5` and stays rounded.
    const dot = card.querySelector("span.bg-type-note");
    expect(dot?.className).toMatch(/size-2\.5/);
    expect(dot?.className).toMatch(/rounded-full/);
    // No pill in this variant.
    expect(card.querySelector("[data-testid='content-card-pill']")).toBeNull();
  });

  it("renders a metadata summary for a person's role", () => {
    const person: BrowseItem = {
      ...baseItem,
      type: "person",
      metadata: { role: "DevOps lead", email: "sarah@example.com" },
    };
    render(<ContentCard item={person} />);
    const summary = screen.getByTestId("content-card-metadata-summary");
    expect(summary).toHaveTextContent("DevOps lead");
  });

  it("omits the metadata summary when there is nothing to show", () => {
    render(<ContentCard item={baseItem} />);
    expect(
      screen.queryByTestId("content-card-metadata-summary")
    ).not.toBeInTheDocument();
  });

  it("renders the FTS5 snippet with <mark> highlighting matched terms", () => {
    const item: BrowseItem = {
      ...baseItem,
      snippet: "…bridge <mark>networks</mark> are the default…",
    };
    render(<ContentCard item={item} />);
    const snippet = screen.getByTestId("content-card-snippet");
    const mark = snippet.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent("networks");
  });

  it("keeps the line-clamped styling on the snippet paragraph", () => {
    const item: BrowseItem = { ...baseItem, snippet: "a <mark>b</mark> c" };
    render(<ContentCard item={item} />);
    expect(screen.getByTestId("content-card-snippet").className).toMatch(
      /md:line-clamp-3/
    );
  });

  it("falls back to the plain content preview when there is no snippet", () => {
    render(<ContentCard item={baseItem} />);
    // No snippet test id, and the plain preview text is shown.
    expect(
      screen.queryByTestId("content-card-snippet")
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Bridge networks/)).toBeInTheDocument();
  });

  it("treats markup inside the snippet as inert text (XSS-safe)", () => {
    // FTS5's snippet() does not escape source content, so a note
    // containing a <script> tag would surface in the snippet. We
    // render segments as React text children, which escape markup —
    // so no executable element is ever created.
    const item: BrowseItem = {
      ...baseItem,
      snippet: "…<mark>docker</mark><script>alert(1)</script>…",
    };
    const { container } = render(<ContentCard item={item} />);
    expect(container.querySelector("script")).toBeNull();
    // The matched term still highlights.
    const mark = screen
      .getByTestId("content-card-snippet")
      .querySelector("mark");
    expect(mark).toHaveTextContent("docker");
  });
});

describe("metadataSummary", () => {
  it("returns the role for a person", () => {
    expect(metadataSummary("person", { role: "DevOps lead" })).toBe(
      "DevOps lead"
    );
  });
  it("returns the status for a project", () => {
    expect(metadataSummary("project", { status: "active" })).toBe("active");
  });
  it("returns the start_date for an event", () => {
    expect(
      metadataSummary("event", { start_date: "2026-04-12T09:30:00Z" })
    ).toBe("2026-04-12T09:30:00Z");
  });
  it("returns the mood for a dream", () => {
    expect(metadataSummary("dream", { mood: "surreal" })).toBe("surreal");
  });
  it("ignores blank / whitespace-only values", () => {
    expect(metadataSummary("person", { role: "   " })).toBeNull();
  });
  it("returns null when metadata is absent", () => {
    expect(metadataSummary("person", null)).toBeNull();
    expect(metadataSummary("person", undefined)).toBeNull();
  });
  it("returns null for types without a summary field", () => {
    expect(metadataSummary("note", { anything: 1 })).toBeNull();
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

describe("formatAbsoluteTime", () => {
  it("formats an ISO timestamp as a medium date + short time", () => {
    // Locale "en", UTC input. The exact hour depends on the
    // runtime timezone, so we assert on the stable date + the
    // four-digit year rather than the full string.
    const out = formatAbsoluteTime("2026-06-21T12:00:00.000Z");
    expect(out).toMatch(/Jun 21, 2026/);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/(:\d{2}|AM|PM)/);
  });
  it("returns the input unchanged when the timestamp is unparseable", () => {
    expect(formatAbsoluteTime("not-a-date")).toBe("not-a-date");
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
