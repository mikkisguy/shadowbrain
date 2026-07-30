import { describe, expect, it } from "vitest";

import { toggleTaskAt } from "@/lib/markdown/toggle-task";

describe("toggleTaskAt", () => {
  it("toggles a basic unchecked task in both directions", () => {
    const unchecked = "- [ ] write tests";

    expect(toggleTaskAt(unchecked, 0)).toBe("- [x] write tests");
    expect(toggleTaskAt("- [x] write tests", 0)).toBe(unchecked);
  });

  it("treats an uppercase X as checked", () => {
    expect(toggleTaskAt("- [X] already done", 0)).toBe("- [ ] already done");
  });

  it("uses document order when duplicate tasks are present", () => {
    const markdown = "- [ ] first\n- [ ] second\n- [ ] third";

    expect(toggleTaskAt(markdown, 1)).toBe(
      "- [ ] first\n- [x] second\n- [ ] third"
    );
  });

  it("maps a multiline task marker before an ordinary task in document order", () => {
    const markdown = "-\n  [ ] first\n- [ ] second";

    expect(toggleTaskAt(markdown, 0)).toBe("-\n  [x] first\n- [ ] second");
    expect(toggleTaskAt(markdown, 1)).toBe("-\n  [ ] first\n- [x] second");
  });

  it("toggles ordered list tasks with dot and parenthesis markers", () => {
    const markdown = "1. [ ] first\n2) [X] second";

    expect(toggleTaskAt(markdown, 0)).toBe("1. [x] first\n2) [X] second");
    expect(toggleTaskAt(markdown, 1)).toBe("1. [ ] first\n2) [ ] second");
  });

  it("toggles indented nested tasks", () => {
    const markdown = "- [ ] parent\n  *  [ ] nested\n\t+ [x] deeper";

    expect(toggleTaskAt(markdown, 1)).toBe(
      "- [ ] parent\n  *  [x] nested\n\t+ [x] deeper"
    );
  });

  it("skips pseudo-checkboxes inside fenced code blocks", () => {
    const markdown =
      "```md\n- [ ] example\n```\n- [ ] real task\n```\n- [ ] another example\n```";

    expect(toggleTaskAt(markdown, 0)).toBe(
      "```md\n- [ ] example\n```\n- [x] real task\n```\n- [ ] another example\n```"
    );
  });

  it("returns null when the index is out of range", () => {
    expect(toggleTaskAt("- [ ] only task", 1)).toBeNull();
    expect(toggleTaskAt("- [ ] only task", -1)).toBeNull();
  });

  it("preserves CRLF line endings", () => {
    const markdown = "- [ ] first\r\n- [x] second\r\n";

    expect(toggleTaskAt(markdown, 0)).toBe("- [x] first\r\n- [x] second\r\n");
  });

  it("does not count non-task list items", () => {
    const markdown = "- [not a task]\n* [ ] actual task";

    expect(toggleTaskAt(markdown, 0)).toBe("- [not a task]\n* [x] actual task");
  });

  it("keeps blockquote tasks in document order", () => {
    const markdown = "> - [ ] quoted\n- [ ] ordinary";

    expect(toggleTaskAt(markdown, 0)).toBe("> - [x] quoted\n- [ ] ordinary");
    expect(toggleTaskAt(markdown, 1)).toBe("> - [ ] quoted\n- [x] ordinary");
  });

  it("ignores tilde fences, unequal backtick fences, and indented code", () => {
    const markdown =
      "~~~md\n- [ ] tilde\n~~~\n````md\n- [ ] backtick\n`````\n- [ ] real\n\ntext\n\n    - [ ] indented\n\n- [ ] last";

    expect(toggleTaskAt(markdown, 0)).toContain("`````\n- [x] real\n");
    expect(toggleTaskAt(markdown, 1)).toContain("- [x] last");
    expect(toggleTaskAt(markdown, 2)).toBeNull();
  });

  it("handles nested tasks and rejects invalid markers before real tasks", () => {
    const markdown = "- [ ] parent\n  - [ ] nested\n- [ ]no\n- [ ] real";

    expect(toggleTaskAt(markdown, 1)).toBe(
      "- [ ] parent\n  - [x] nested\n- [ ]no\n- [ ] real"
    );
    expect(toggleTaskAt(markdown, 2)).toBe(
      "- [ ] parent\n  - [ ] nested\n- [ ]no\n- [x] real"
    );
  });
});
