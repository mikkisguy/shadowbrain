// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkflowStatusStrip } from "./workflow-status-strip";

describe("WorkflowStatusStrip", () => {
  it("renders the three workflow status options", () => {
    render(<WorkflowStatusStrip value="todo" onChange={() => undefined} />);

    expect(
      screen.getByRole("group", { name: /workflow status/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /to do/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("button", { name: /in progress/i })
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /done/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("emits the next status on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WorkflowStatusStrip value="todo" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /in progress/i }));
    expect(onChange).toHaveBeenCalledWith("in_progress");
  });

  it("does not emit when the active option is re-clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WorkflowStatusStrip value="done" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables every option when disabled is set", () => {
    render(
      <WorkflowStatusStrip value="todo" onChange={() => undefined} disabled />
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
