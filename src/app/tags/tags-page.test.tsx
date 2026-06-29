// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TagsPage } from "./tags-page";
import type { TagWithCount } from "./types";

/**
 * End-to-end-ish tests for the Tags page.
 *
 * `useTags` is mocked so the list, status, and `refresh` are
 * controlled by the test; the API mutation client is mocked so we
 * can assert each dialog wires its submit to the right call and
 * triggers a `refresh` on success.
 */

const refresh = vi.fn();
const createTag = vi.fn();
const renameTag = vi.fn();
const deleteTag = vi.fn();
const mergeTag = vi.fn();
const deleteUnusedTags = vi.fn();

const hookValues: {
  tags: TagWithCount[];
  status: "loading" | "success" | "error";
  error: string | null;
  refresh: typeof refresh;
} = {
  tags: [],
  status: "success",
  error: null,
  refresh,
};

vi.mock("./use-tags", () => ({
  useTags: () => hookValues,
}));

vi.mock("./api", () => ({
  createTag: (name: string) => createTag(name),
  renameTag: (id: string, name: string) => renameTag(id, name),
  deleteTag: (id: string) => deleteTag(id),
  mergeTag: (sourceId: string, targetId: string) =>
    mergeTag(sourceId, targetId),
  deleteUnusedTags: () => deleteUnusedTags(),
}));

function tag(name: string, count = 0): TagWithCount {
  return { id: name, name, color: null, created_at: "x", count };
}

beforeEach(() => {
  refresh.mockReset();
  createTag.mockReset().mockResolvedValue(undefined);
  renameTag.mockReset().mockResolvedValue(undefined);
  deleteTag.mockReset().mockResolvedValue(undefined);
  mergeTag.mockReset().mockResolvedValue(undefined);
  deleteUnusedTags.mockReset().mockResolvedValue({ deleted: 0 });
  hookValues.tags = [];
  hookValues.status = "success";
  hookValues.error = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TagsPage", () => {
  it("renders a row with name and count for each tag", () => {
    hookValues.tags = [tag("alpha", 3), tag("beta", 0)];
    render(<TagsPage />);
    const rows = screen.getAllByTestId("tag-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("tag-count")).toHaveTextContent("3");
  });

  it("shows the tag count in the header", () => {
    hookValues.tags = [tag("alpha"), tag("beta")];
    render(<TagsPage />);
    expect(screen.getByText(/2 tags/)).toBeInTheDocument();
  });

  it("sorts by name ascending by default", () => {
    hookValues.tags = [tag("gamma"), tag("alpha"), tag("beta")];
    render(<TagsPage />);
    const names = screen
      .getAllByTestId("tag-row")
      .map((row) => within(row).getByText(/alpha|beta|gamma/).textContent);
    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sorts by count descending when the Count toggle is clicked", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha", 2), tag("beta", 5), tag("gamma", 1)];
    render(<TagsPage />);
    await user.click(screen.getByTestId("sort-count"));
    const names = screen
      .getAllByTestId("tag-row")
      .map((row) => within(row).getByText(/alpha|beta|gamma/).textContent);
    expect(names).toEqual(["beta", "alpha", "gamma"]);
  });

  it("flips direction when the active sort field is clicked again", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha"), tag("beta")];
    render(<TagsPage />);
    // Name is active+asc by default; click flips to desc.
    await user.click(screen.getByTestId("sort-name"));
    const names = screen
      .getAllByTestId("tag-row")
      .map((row) => within(row).getByText(/alpha|beta/).textContent);
    expect(names).toEqual(["beta", "alpha"]);
  });

  it("renders the loading state", () => {
    hookValues.status = "loading";
    render(<TagsPage />);
    expect(screen.getByTestId("tags-loading")).toBeInTheDocument();
  });

  it("renders the error state and retries", async () => {
    const user = userEvent.setup();
    hookValues.status = "error";
    hookValues.error = "Boom";
    render(<TagsPage />);
    expect(screen.getByTestId("tags-error")).toHaveTextContent("Boom");
    await user.click(screen.getByTestId("tags-retry"));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders the empty state when there are no tags", () => {
    hookValues.tags = [];
    render(<TagsPage />);
    expect(screen.getByTestId("tags-empty")).toBeInTheDocument();
  });

  it("opens the create dialog and creates a tag", async () => {
    const user = userEvent.setup();
    render(<TagsPage />);
    await user.click(screen.getByTestId("new-tag-button"));
    expect(screen.getByTestId("tag-form-dialog")).toBeInTheDocument();

    await user.type(screen.getByTestId("tag-name-input"), "newtag");
    await user.click(screen.getByTestId("tag-form-submit"));

    await waitFor(() => expect(createTag).toHaveBeenCalledWith("newtag"));
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks creating a duplicate name client-side", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha")];
    render(<TagsPage />);
    await user.click(screen.getByTestId("new-tag-button"));
    await user.type(screen.getByTestId("tag-name-input"), "ALPHA");
    await user.click(screen.getByTestId("tag-form-submit"));

    expect(screen.getByTestId("tag-form-error")).toBeInTheDocument();
    expect(createTag).not.toHaveBeenCalled();
  });

  it("opens the rename dialog seeded with the current name", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha")];
    render(<TagsPage />);
    await user.click(screen.getByTestId("tag-rename-button"));

    const input = screen.getByTestId("tag-name-input") as HTMLInputElement;
    expect(input.value).toBe("alpha");

    await user.clear(input);
    await user.type(input, "renamed");
    await user.click(screen.getByTestId("tag-form-submit"));

    await waitFor(() =>
      expect(renameTag).toHaveBeenCalledWith("alpha", "renamed")
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks dismissing the dialog while a create is in flight", async () => {
    const user = userEvent.setup();
    // A create that never resolves keeps the dialog in its in-flight
    // state for the duration of the test.
    let resolve: (() => void) | undefined;
    createTag.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = () => r();
      })
    );
    render(<TagsPage />);
    await user.click(screen.getByTestId("new-tag-button"));
    await user.type(screen.getByTestId("tag-name-input"), "newtag");
    await user.click(screen.getByTestId("tag-form-submit"));

    await waitFor(() => expect(createTag).toHaveBeenCalled());
    // Escape must not tear down the dialog mid-request.
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("tag-form-dialog")).toBeInTheDocument();

    resolve?.();
  });

  it("confirms and deletes a tag", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha", 4)];
    render(<TagsPage />);
    await user.click(screen.getByTestId("tag-delete-button"));

    const dialog = screen.getByTestId("delete-tag-dialog");
    expect(dialog).toHaveTextContent("4 items");

    await user.click(screen.getByTestId("delete-tag-confirm"));
    await waitFor(() => expect(deleteTag).toHaveBeenCalledWith("alpha"));
    expect(refresh).toHaveBeenCalled();
  });

  it("filters tags by search query", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha"), tag("beta"), tag("gamma")];
    render(<TagsPage />);

    await user.type(screen.getByTestId("tags-search"), "alp");
    expect(screen.getAllByTestId("tag-row")).toHaveLength(1);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("shows a no-matches state when search finds nothing", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha")];
    render(<TagsPage />);

    await user.type(screen.getByTestId("tags-search"), "zzz");
    expect(screen.getByTestId("tags-no-matches")).toBeInTheDocument();
    expect(screen.queryByTestId("tags-empty")).not.toBeInTheDocument();
  });

  it("filters to unused tags only", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha", 2), tag("beta", 0), tag("gamma", 0)];
    render(<TagsPage />);

    await user.click(screen.getByTestId("filter-unused"));
    const names = screen
      .getAllByTestId("tag-row")
      .map((row) => within(row).getByText(/beta|gamma/).textContent);
    expect(names).toEqual(["beta", "gamma"]);
  });

  it("shows delete-unused when unused tags exist and confirms bulk delete", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha", 1), tag("beta", 0)];
    render(<TagsPage />);

    expect(screen.getByTestId("delete-unused-button")).toHaveTextContent(
      "Delete unused (1)"
    );
    await user.click(screen.getByTestId("delete-unused-button"));
    await user.click(screen.getByTestId("delete-unused-tags-confirm"));

    await waitFor(() => expect(deleteUnusedTags).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("opens the merge dialog and merges tags", async () => {
    const user = userEvent.setup();
    hookValues.tags = [tag("alpha", 3), tag("beta", 1)];
    render(<TagsPage />);

    await user.click(screen.getAllByTestId("tag-merge-button")[0]);
    expect(screen.getByTestId("merge-tag-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("merge-tag-dialog")).toHaveTextContent("3 items");

    await user.click(screen.getByTestId("merge-tag-confirm"));
    await waitFor(() => expect(mergeTag).toHaveBeenCalledWith("alpha", "beta"));
    expect(refresh).toHaveBeenCalled();
  });
});
