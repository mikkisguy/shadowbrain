// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentTypeLabel } from "./content-type-label";

describe("ContentTypeLabel", () => {
  it("renders the label with a type-colour dot", () => {
    const { container } = render(
      <ContentTypeLabel type="bookmark" label="Bookmark" />
    );

    expect(screen.getByText("Bookmark")).toBeInTheDocument();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass("bg-type-bookmark");
    expect(dot).toHaveClass("size-1.5");
  });

  it("falls back to typeLabel when label is omitted", () => {
    render(<ContentTypeLabel type="journal" />);
    expect(screen.getByText("Journal")).toBeInTheDocument();
  });

  it("uses the md dot size when requested", () => {
    const { container } = render(
      <ContentTypeLabel type="note" label="Note" dotSize="md" />
    );
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass("size-2");
  });
});
