import { describe, expect, it } from "vitest";

import {
  readViewsFromParams,
  viewsStateEqual,
  writeViewsToParams,
} from "./views-url-sync";

describe("views-url-sync", () => {
  it("reads view, project, and item from params", () => {
    const params = new URLSearchParams({
      view: "timeline",
      project: "proj-1",
      item: "item-1",
    });
    expect(readViewsFromParams(params)).toEqual({
      view: "timeline",
      projectId: "proj-1",
      itemId: "item-1",
    });
  });

  it("coerces invalid view values when reading", () => {
    const params = new URLSearchParams({ view: "not-real" });
    expect(readViewsFromParams(params)).toEqual({
      view: "grid",
      projectId: null,
      itemId: null,
    });
  });

  it("omits default grid view when writing", () => {
    const base = new URLSearchParams({ from: "login" });
    const next = writeViewsToParams(base, {
      view: "grid",
      projectId: "p1",
      itemId: null,
    });
    expect(next.get("view")).toBeNull();
    expect(next.get("project")).toBe("p1");
    expect(next.get("from")).toBe("login");
  });

  it("writes non-default views and clears empty values", () => {
    const base = new URLSearchParams({ project: "old", item: "old" });
    const next = writeViewsToParams(base, {
      view: "kanban",
      projectId: null,
      itemId: null,
    });
    expect(next.get("view")).toBe("kanban");
    expect(next.get("project")).toBeNull();
    expect(next.get("item")).toBeNull();
  });

  it("detects equal state sets", () => {
    expect(
      viewsStateEqual(
        { view: "grid", projectId: "a", itemId: null },
        { view: "grid", projectId: "a", itemId: null }
      )
    ).toBe(true);
    expect(
      viewsStateEqual(
        { view: "timeline", projectId: null, itemId: null },
        { view: "grid", projectId: null, itemId: null }
      )
    ).toBe(false);
  });
});
