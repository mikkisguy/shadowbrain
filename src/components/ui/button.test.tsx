// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

function consoleErrorsMentioningNativeButton(
  spy: ReturnType<typeof vi.spyOn>
): boolean {
  return spy.mock.calls.some((args: unknown[]) =>
    args.some(
      (arg: unknown) =>
        typeof arg === "string" && arg.includes("expected a native <button>")
    )
  );
}

describe("Button nativeButton defaults", () => {
  it("renders a native button when no render prop is provided", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" }).tagName).toBe("BUTTON");
  });

  it("defaults nativeButton to false when render is a non-button element", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Button render={<a href="/backup" />} variant="ghost">
        Backup guide
      </Button>
    );

    // Base UI still exposes button semantics via role="button", but the
    // host element must remain the rendered <a> (nativeButton=false).
    const host = screen.getByRole("button", { name: "Backup guide" });
    expect(host.tagName).toBe("A");
    expect(host).toHaveAttribute("href", "/backup");
    expect(consoleErrorsMentioningNativeButton(errorSpy)).toBe(false);

    errorSpy.mockRestore();
  });

  it("warns when nativeButton is forced true on a non-button render host", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Button render={<a href="/backup" />} nativeButton>
        Forced native
      </Button>
    );

    expect(consoleErrorsMentioningNativeButton(errorSpy)).toBe(true);
    errorSpy.mockRestore();
  });

  it("honors an explicit nativeButton override with a button render host", () => {
    render(
      <Button render={<button type="button" />} nativeButton>
        Explicit
      </Button>
    );

    expect(screen.getByRole("button", { name: "Explicit" }).tagName).toBe(
      "BUTTON"
    );
  });
});
