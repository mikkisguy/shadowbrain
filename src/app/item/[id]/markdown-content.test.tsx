// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, toastError } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

import { MarkdownContent } from "./markdown-content";

function patchResponse(
  content: string,
  updated_at = "2026-07-29T00:00:01.000Z"
): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ item: { content, updated_at } }),
  } as Response;
}

describe("MarkdownContent", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastError.mockReset();
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders open details safely and names only generated task controls", () => {
    render(
      <MarkdownContent
        content={
          '<details open><summary>More</summary><script>alert(1)</script><style>bad{}</style><a href="javascript:alert(1)" onclick="alert(1)">bad</a></details>\n\n<input type="checkbox">\n\n- [ ] Ship it'
        }
        itemId="item-1"
        interactive
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );

    expect(screen.getByText("More").closest("details")).toHaveAttribute("open");
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("style")).toBeNull();
    expect(screen.getByText("bad").closest("a")).not.toHaveAttribute("href");

    const inputs = screen.getAllByRole("checkbox");
    expect(inputs).toHaveLength(2);
    expect(inputs.some((input) => (input as HTMLInputElement).disabled)).toBe(
      true
    );
    const generated = inputs.find(
      (input) => !(input as HTMLInputElement).disabled
    );
    expect(generated).toBeDefined();
    expect(generated).toHaveAccessibleName("Ship it");
  });

  it("PATCHes the interactive item with visibility and revision flags", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(patchResponse("- [x] Ship it"));
    render(
      <MarkdownContent
        content="- [ ] Ship it"
        interactive
        itemId="hidden-private"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );

    await userEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/items/hidden-private?include_hidden=1&include_private=1"
    );
    expect(JSON.parse(String((request as RequestInit).body))).toEqual({
      content: "- [x] Ship it",
      expected_updated_at: "2026-07-29T00:00:00.000Z",
    });
  });

  it("maps multiline task inputs to their own source markers", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(patchResponse("-\n  [x] first\n- [ ] second"))
      .mockResolvedValueOnce(patchResponse("-\n  [x] first\n- [x] second"));
    const user = userEvent.setup();
    render(
      <MarkdownContent
        content={"-\n  [ ] first\n- [ ] second"}
        interactive
        itemId="item-1"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );

    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(boxes[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      content: "-\n  [x] first\n- [ ] second",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      content: "-\n  [x] first\n- [x] second",
    });
  });

  it("uses first-block task text for tight, loose, and nested task names", () => {
    render(
      <MarkdownContent
        content={
          "- [ ] tight\n\n- [ ] loose paragraph\n\n  detail\n\n- [ ] parent\n  1. [ ] nested ordered\n  - [ ] nested unordered"
        }
        interactive
        itemId="item-1"
      />
    );

    expect(screen.getByRole("checkbox", { name: "tight" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "loose paragraph" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "parent" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "nested ordered" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "nested unordered" })
    ).toBeInTheDocument();
  });

  it("keeps a committed save when stale props drain and reuses its revision", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        patchResponse("- [x] saved", "2026-07-29T00:00:01.000Z")
      )
      .mockResolvedValueOnce(
        patchResponse("- [ ] saved", "2026-07-29T00:00:02.000Z")
      );
    const user = userEvent.setup();
    const view = render(
      <MarkdownContent
        content="- [ ] saved"
        interactive
        itemId="item-1"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    view.rerender(
      <MarkdownContent
        content="- [ ] saved"
        interactive
        itemId="item-1"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      expected_updated_at: "2026-07-29T00:00:01.000Z",
    });
  });

  it("serializes rapid toggles and rolls back a failed save", async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const user = userEvent.setup();
    render(
      <MarkdownContent
        content={"- [ ] first\n\n- [ ] second"}
        interactive
        itemId="item-1"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );

    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst(patchResponse("- [x] first\n\n- [ ] second"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      content: "- [x] first\n\n- [x] second",
    });
    resolveSecond(patchResponse("- [x] first\n\n- [x] second"));

    const failedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"));
    // A new rendered instance exercises the rollback path independently.
    render(
      <MarkdownContent
        content="- [ ] rollback"
        interactive
        itemId="item-2"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );
    await user.click(screen.getAllByRole("checkbox").at(-1)!);
    await waitFor(() => expect(failedFetch).toHaveBeenCalled());
    expect(screen.getAllByRole("checkbox").at(-1)).not.toBeChecked();
  });

  it("reloads latest content after a conflict and reconciles props after save drain", async () => {
    let resolvePatch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(
        new Response(null, { status: 409, statusText: "Conflict" })
      )
      .mockResolvedValueOnce(
        patchResponse("- [ ] server latest", "2026-07-29T00:00:02.000Z")
      );
    const user = userEvent.setup();
    const view = render(
      <MarkdownContent
        content="- [ ] pending"
        interactive
        itemId="item-1"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );
    await user.click(screen.getByRole("checkbox"));
    view.rerender(
      <MarkdownContent
        content="- [ ] newer prop"
        interactive
        itemId="item-1"
        updatedAt="2026-07-29T00:00:01.000Z"
      />
    );
    resolvePatch(patchResponse("- [x] pending", "2026-07-29T00:00:00.500Z"));
    await waitFor(() =>
      expect(screen.getByText("newer prop")).toBeInTheDocument()
    );

    const conflictView = render(
      <MarkdownContent
        content="- [ ] conflict"
        interactive
        itemId="item-2"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );
    await user.click(screen.getAllByRole("checkbox").at(-1)!);
    await waitFor(() =>
      expect(screen.getByText("server latest")).toBeInTheDocument()
    );
    expect(toastError).toHaveBeenCalled();
    conflictView.unmount();
  });
  it("discards queued clicks through a conflict reconciliation epoch", async () => {
    let resolveFirstPatch!: (response: Response) => void;
    const firstPatch = new Promise<Response>((resolve) => {
      resolveFirstPatch = resolve;
    });
    let resolveLatest!: (response: Response) => void;
    const latest = new Promise<Response>((resolve) => {
      resolveLatest = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(firstPatch)
      .mockReturnValueOnce(latest);
    const user = userEvent.setup();
    render(
      <MarkdownContent
        content={"- [ ] first\n- [ ] second"}
        interactive
        itemId="item-1"
        updatedAt="2026-07-29T00:00:00.000Z"
      />
    );

    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Second click queues while the first PATCH is still in flight.
    await user.click(boxes[1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirstPatch(new Response(null, { status: 409 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Click during conflict refetch must not start another PATCH.
    await user.click(boxes[0]);
    resolveLatest(
      patchResponse("- [ ] server latest", "2026-07-29T00:00:02.000Z")
    );

    await waitFor(() =>
      expect(screen.getByText("server latest")).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("syncs controlled content props when no revision is provided", () => {
    const { rerender } = render(<MarkdownContent content="- [ ] draft one" />);
    expect(screen.getByText("draft one")).toBeInTheDocument();

    rerender(<MarkdownContent content="- [ ] draft two" />);
    expect(screen.getByText("draft two")).toBeInTheDocument();
    expect(screen.queryByText("draft one")).not.toBeInTheDocument();
  });

  it("gates persistence when interactive or itemId is absent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { rerender } = render(
      <MarkdownContent content="- [ ] read-only" interactive={false} />
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(<MarkdownContent content="- [ ] missing id" interactive />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
